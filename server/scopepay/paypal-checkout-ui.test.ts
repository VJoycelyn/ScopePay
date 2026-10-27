import { afterEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => {
  class MockScopePayApiError extends Error {
    code?: string;
    status: number;

    constructor(message: string, status: number, code?: string) {
      super(message);
      this.name = "ScopePayApiError";
      this.status = status;
      this.code = code;
    }
  }

  return {
    api: {
      createOrder: vi.fn(),
      captureOrder: vi.fn(),
      reconcileOrder: vi.fn(),
    },
    ScopePayApiError: MockScopePayApiError,
    runtime: null as HookRuntime | null,
  };
});

vi.mock("../../client/src/lib/scopepay-api", () => ({
  scopepayApi: testState.api,
  ScopePayApiError: testState.ScopePayApiError,
}));

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useState: (initial: unknown) => testState.runtime!.useState(initial),
    useRef: (initial: unknown) => testState.runtime!.useRef(initial),
    useEffect: (effect: () => unknown, deps?: unknown[]) =>
      testState.runtime!.useEffect(effect, deps),
  };
});

import { PayPalCheckout } from "../../client/src/components/scopepay/PayPalCheckout";
import * as React from "react";

(globalThis as any).React = React;

type AnyElement = {
  type?: unknown;
  props?: Record<string, any>;
};

type EffectSlot = {
  deps?: unknown[];
  cleanup?: unknown;
};

class HookRuntime {
  private hookIndex = 0;
  private states: unknown[] = [];
  private refs: Array<{ current: any }> = [];
  private effects: Array<EffectSlot | undefined> = [];
  private pendingEffects: Array<{
    index: number;
    effect: () => unknown;
    deps?: unknown[];
  }> = [];
  private dirty = false;
  tree: unknown;

  constructor(
    private readonly component: (props: any) => unknown,
    private readonly props: any,
    private readonly container: { innerHTML: string }
  ) {}

  useState(initial: unknown) {
    const index = this.hookIndex++;
    if (!(index in this.states)) {
      this.states[index] =
        typeof initial === "function" ? (initial as () => unknown)() : initial;
    }
    const setState = (next: unknown | ((value: unknown) => unknown)) => {
      const value =
        typeof next === "function"
          ? (next as (current: unknown) => unknown)(this.states[index])
          : next;
      if (!Object.is(value, this.states[index])) {
        this.states[index] = value;
        this.dirty = true;
      }
    };
    return [this.states[index], setState] as const;
  }

  useRef(initial: unknown) {
    const index = this.hookIndex++;
    if (!(index in this.refs)) {
      // PayPalCheckout's first ref is the button container. A renderer would
      // assign this DOM node; the node-less harness assigns it here instead.
      this.refs[index] = {
        current: index === 0 ? this.container : initial,
      };
    }
    return this.refs[index];
  }

  useEffect(effect: () => unknown, deps?: unknown[]) {
    const index = this.hookIndex++;
    const previous = this.effects[index]?.deps;
    const changed =
      deps === undefined ||
      previous === undefined ||
      deps.length !== previous.length ||
      deps.some((value, position) => !Object.is(value, previous[position]));
    if (changed) this.pendingEffects.push({ index, effect, deps });
  }

  flush() {
    for (let pass = 0; pass < 20; pass += 1) {
      this.dirty = false;
      this.hookIndex = 0;
      this.pendingEffects = [];
      this.tree = this.component(this.props);
      const effects = this.pendingEffects;
      for (const pending of effects) {
        const previous = this.effects[pending.index];
        if (typeof previous?.cleanup === "function") previous.cleanup();
        this.effects[pending.index] = {
          deps: pending.deps,
          cleanup: pending.effect(),
        };
      }
      if (!this.dirty) return;
    }
    throw new Error("hook harness exceeded its rerender limit");
  }
}

function makeReview(
  status: "accepted" | "payment_pending" | "paid" = "accepted",
  paypalOrderId = "saved-order-1"
) {
  return {
    project: { id: "project-1", name: "Test project" },
    document: {
      id: "document-1",
      version: 2,
      status,
      title: "A test document",
      body: "A test body",
      totalCents: 1250,
      currency: "USD",
      paypalOrderId,
      paypalCaptureId: null,
      paidAt: null,
    },
  } as any;
}

function makeStatus() {
  return {
    paypalConfigured: true,
    paypalClientId: "sandbox-client-id",
  } as any;
}

function collectElements(
  value: unknown,
  result: AnyElement[] = []
): AnyElement[] {
  if (!value || typeof value !== "object") return result;
  if (Array.isArray(value)) {
    for (const child of value) collectElements(child, result);
    return result;
  }
  const element = value as AnyElement;
  if (element.props) {
    result.push(element);
    collectElements(element.props.children, result);
  }
  return result;
}

function renderedText(value: unknown): string {
  if (value === null || value === undefined || typeof value === "boolean")
    return "";
  if (typeof value === "string" || typeof value === "number")
    return String(value);
  if (Array.isArray(value)) return value.map(renderedText).join("");
  if (typeof value === "object") {
    const element = value as AnyElement;
    return renderedText(element.props?.children);
  }
  return "";
}

function buttons(value: unknown) {
  return collectElements(value).filter(element => element.type === "button");
}

function buttonNamed(value: unknown, name: string) {
  return buttons(value).find(button => renderedText(button).includes(name));
}

function installBrowserFakes() {
  const container = { innerHTML: "" };
  const scripts: any[] = [];
  const capturedOptions: any[] = [];
  const paypal = {
    Buttons: vi.fn((options: any) => {
      capturedOptions.push(options);
      return { render: vi.fn(async () => undefined) };
    }),
  };
  const documentFake = {
    createElement: vi.fn((tagName: string) => {
      if (tagName !== "script") return { tagName };
      return {
        async: false,
        onload: undefined as (() => void) | undefined,
        onerror: undefined as (() => void) | undefined,
        src: "",
        remove: vi.fn(),
      };
    }),
    head: {
      appendChild: vi.fn((script: any) => {
        scripts.push(script);
        script.onload?.();
      }),
    },
  };
  (globalThis as any).window = { paypal };
  (globalThis as any).document = documentFake;
  return { container, capturedOptions, scripts };
}

function mount(review = makeReview()) {
  const browser = installBrowserFakes();
  const onReview = vi.fn();
  const runtime = new HookRuntime(
    props => PayPalCheckout(props),
    {
      token: "client-token",
      review,
      status: makeStatus(),
      onReview,
    },
    browser.container
  );
  testState.runtime = runtime;
  runtime.flush();
  return { ...browser, onReview, runtime };
}

function resetTestState() {
  testState.api.createOrder.mockReset();
  testState.api.captureOrder.mockReset();
  testState.api.reconcileOrder.mockReset();
  testState.runtime = null;
  delete (globalThis as any).window;
  delete (globalThis as any).document;
}

afterEach(resetTestState);

describe("PayPalCheckout payment safety UI", () => {
  it("keeps PAYPAL_ORDER_NOT_FOUND specific when a later SDK error arrives", async () => {
    const missing = new testState.ScopePayApiError(
      "The PayPal order could not be found.",
      404,
      "PAYPAL_ORDER_NOT_FOUND"
    );
    testState.api.createOrder.mockRejectedValue(missing);
    const { capturedOptions, runtime } = mount(makeReview("accepted", ""));
    const sdk = capturedOptions.at(-1);

    await expect(sdk.createOrder()).rejects.toThrow(
      "PayPal order preparation failed"
    );
    runtime.flush();
    const specificMessage = renderedText(runtime.tree);
    expect(specificMessage).toContain(
      "This PayPal Sandbox order is unavailable"
    );
    expect(specificMessage).toContain("Payments recovery");

    sdk.onError(new Error("opaque PayPal SDK failure"));
    runtime.flush();
    expect(renderedText(runtime.tree)).toContain(
      "This PayPal Sandbox order is unavailable"
    );
    expect(renderedText(runtime.tree)).not.toContain(
      "opaque PayPal SDK failure"
    );
    expect(
      buttonNamed(runtime.tree, "Prepare direct PayPal link")
    ).toBeUndefined();
  });

  it("treats an unknown SDK error as neutral and exposes same-order verification", async () => {
    const { capturedOptions, runtime, onReview } = mount();
    const sdk = capturedOptions.at(-1);

    sdk.onError(new Error("provider detail must stay out of the UI"));
    runtime.flush();
    expect(renderedText(runtime.tree)).toContain(
      "ScopePay has not verified a completed capture"
    );
    expect(renderedText(runtime.tree)).not.toContain(
      "Payment recorded by the sandbox"
    );
    const verify = buttonNamed(runtime.tree, "Verify this same order");
    expect(verify).toBeDefined();

    testState.api.reconcileOrder.mockResolvedValue(
      makeReview("accepted", "saved-order-1")
    );
    verify!.props!.onClick();
    await Promise.resolve();
    runtime.flush();
    expect(testState.api.reconcileOrder).toHaveBeenCalledWith(
      "client-token",
      "saved-order-1"
    );
    expect(testState.api.createOrder).not.toHaveBeenCalled();
    expect(testState.api.captureOrder).not.toHaveBeenCalled();
    expect(onReview).toHaveBeenCalledTimes(1);
  });

  it("only reconciles after the user clicks verification, never on mount or by creating/capturing", async () => {
    const { capturedOptions, runtime } = mount(
      makeReview("payment_pending", "saved-order-1")
    );
    expect(testState.api.reconcileOrder).not.toHaveBeenCalled();
    expect(testState.api.createOrder).not.toHaveBeenCalled();
    expect(testState.api.captureOrder).not.toHaveBeenCalled();

    // Recovery renders the explicit Verify payment action, which is the only
    // permitted entry point for the GET reconciliation request.
    const verify = buttonNamed(runtime.tree, "Verify payment");
    expect(verify).toBeDefined();
    testState.api.reconcileOrder.mockResolvedValue(
      makeReview("payment_pending", "saved-order-1")
    );
    verify!.props!.onClick();
    await Promise.resolve();
    runtime.flush();
    expect(testState.api.reconcileOrder).toHaveBeenCalledTimes(1);
    expect(capturedOptions).toHaveLength(0);
    expect(testState.api.createOrder).not.toHaveBeenCalled();
    expect(testState.api.captureOrder).not.toHaveBeenCalled();
  });

  it("does not restore purchase controls when an unavailable-order error is dismissed", async () => {
    testState.api.createOrder.mockRejectedValue(
      new testState.ScopePayApiError(
        "The PayPal order could not be found.",
        404,
        "PAYPAL_ORDER_NOT_FOUND"
      )
    );
    const { capturedOptions, runtime } = mount(makeReview("accepted", ""));
    await expect(capturedOptions.at(-1).createOrder()).rejects.toThrow();
    runtime.flush();
    const dismiss = buttonNamed(runtime.tree, "Dismiss");
    expect(dismiss).toBeDefined();
    dismiss!.props!.onClick();
    runtime.flush();

    expect(renderedText(runtime.tree)).toContain(
      "saved Sandbox order cannot be used"
    );
    expect(
      buttonNamed(runtime.tree, "Prepare direct PayPal link")
    ).toBeUndefined();
    expect(buttonNamed(runtime.tree, "Preparing direct link")).toBeUndefined();
    expect(capturedOptions).toHaveLength(1);
  });

  it("does not downgrade a verified paid state when a late SDK error fires", async () => {
    testState.api.captureOrder.mockResolvedValue({
      status: "paid",
      orderId: "provider-order-1",
      captureId: "capture-1",
      amountCents: 1250,
      currency: "USD",
    });
    const { capturedOptions, runtime, onReview } = mount();
    const originalSdk = capturedOptions.at(-1);

    await originalSdk.onApprove({ orderID: "provider-order-1" });
    runtime.flush();
    expect(onReview).toHaveBeenCalledTimes(1);
    expect(renderedText(runtime.tree)).toContain(
      "Payment recorded by the sandbox"
    );

    originalSdk.onError(new Error("late SDK noise"));
    runtime.flush();
    expect(renderedText(runtime.tree)).toContain(
      "Payment recorded by the sandbox"
    );
    expect(renderedText(runtime.tree)).not.toContain("late SDK noise");
  });

  it("does not rerender PayPal buttons when an existing order is prepared", async () => {
    testState.api.createOrder.mockResolvedValue({
      id: "same-provider-order",
      approvalUrl: "https://www.sandbox.paypal.com/checkoutnow?token=fictional",
    });
    const { capturedOptions, runtime } = mount(makeReview("accepted", ""));
    const sdk = capturedOptions[0];
    await expect(sdk.createOrder()).resolves.toBe("same-provider-order");
    runtime.flush();
    expect(capturedOptions).toHaveLength(1);
    expect(testState.api.captureOrder).not.toHaveBeenCalled();
  });

  it("rejects a capture result that does not match the accepted amount", async () => {
    testState.api.captureOrder.mockResolvedValue({
      status: "paid",
      orderId: "saved-order-1",
      captureId: "fictional-capture",
      amountCents: 118750,
      currency: "USD",
    });
    const { capturedOptions, runtime, onReview } = mount();
    await capturedOptions[0].onApprove({ orderID: "saved-order-1" });
    runtime.flush();
    expect(onReview).not.toHaveBeenCalled();
    expect(renderedText(runtime.tree)).not.toContain(
      "Payment recorded by the sandbox"
    );
    expect(renderedText(runtime.tree)).toContain("accepted version and amount");
  });
});
