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
      reissueOrder: vi.fn(),
    },
    ScopePayApiError: MockScopePayApiError,
    runtime: null as HookRuntime | null,
  };
});

vi.mock("../../client/src/lib/scopepay-api", () => ({
  scopepayApi: testState.api,
  ScopePayApiError: testState.ScopePayApiError,
}));

vi.mock("../../client/src/components/scopepay/DocumentEditor", () => ({
  DocumentEditor: () => null,
  ShareLink: ({ token }: { token?: string }) => ({
    type: "div",
    props: {
      children: token ? "Fresh review link" : "Create fresh review link",
    },
  }),
}));

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useState: (initial: unknown) => testState.runtime!.useState(initial),
    useRef: (initial: unknown) => testState.runtime!.useRef(initial),
  };
});

import { PaymentsPanel } from "../../client/src/components/scopepay/WorkspaceComponents";
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
  private dirty = false;
  tree: unknown;

  constructor(
    private readonly component: (props: any) => unknown,
    private readonly props: any
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
    if (!(index in this.refs)) this.refs[index] = { current: initial };
    return this.refs[index];
  }

  flush() {
    for (let pass = 0; pass < 20; pass += 1) {
      this.dirty = false;
      this.hookIndex = 0;
      this.tree = this.component(this.props);
      if (!this.dirty) return;
    }
    throw new Error("hook harness exceeded its rerender limit");
  }
}

function makeProject() {
  const document = {
    id: "document-1",
    kind: "quote",
    title: "A test document",
    scopeSummary: "A test scope",
    deliverables: [],
    exclusions: [],
    timeline: "One week",
    revisionLimit: "Two rounds",
    currency: "USD",
    totalCents: 1250,
    status: "accepted",
    version: 3,
    clientToken: "client-token",
    acceptedAt: "2026-01-01T00:00:00.000Z",
    paypalOrderId: "saved-order-1",
    paypalCaptureId: undefined,
    createdAt: "2026-01-01T00:00:00.000Z",
    source: "manual",
  };
  return {
    id: "project-1",
    name: "Test project",
    clientName: "Test client",
    brief: "A test brief",
    hourlyRateCents: 10000,
    budgetCents: null,
    quote: document,
    changes: [],
    analyses: [],
    audit: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    isSample: false,
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
    if (typeof element.type === "function") {
      collectElements(element.type(element.props), result);
    } else {
      collectElements(element.props.children, result);
    }
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
    if (typeof element.type === "function")
      return renderedText(element.type(element.props));
    return renderedText(element.props?.children);
  }
  return "";
}

function elementsOfType(value: unknown, type: string) {
  return collectElements(value).filter(element => element.type === type);
}

function buttonNamed(value: unknown, name: string) {
  return elementsOfType(value, "button").find(button =>
    renderedText(button).includes(name)
  );
}

function mount() {
  const project = makeProject();
  const onProject = vi.fn();
  const onReload = vi.fn();
  const runtime = new HookRuntime(props => PaymentsPanel(props), {
    project,
    onProject,
    onReload,
  });
  testState.runtime = runtime;
  runtime.flush();
  return { project, onProject, onReload, runtime };
}

function openRecovery(runtime: HookRuntime) {
  buttonNamed(runtime.tree, "Show recovery options")!.props!.onClick();
  runtime.flush();
}

function confirmRecovery(runtime: HookRuntime) {
  const checkbox = elementsOfType(runtime.tree, "input")[0];
  checkbox.props!.onChange({ target: { checked: true } });
  runtime.flush();
}

function resetTestState() {
  testState.api.reissueOrder.mockReset();
  testState.runtime = null;
}

afterEach(resetTestState);

describe("PaymentsPanel Sandbox recovery safety UI", () => {
  it("requires the Activity confirmation and never reissues automatically", () => {
    const { runtime } = mount();

    expect(testState.api.reissueOrder).not.toHaveBeenCalled();
    openRecovery(runtime);

    const create = buttonNamed(
      runtime.tree,
      "Create replacement Sandbox order"
    );
    expect(create).toBeDefined();
    expect(create!.props!.disabled).toBe(true);
    expect(renderedText(runtime.tree)).toContain("$12.50 · Version 3");
    expect(renderedText(runtime.tree)).toContain("Sandbox Business merchant");
    expect(renderedText(runtime.tree)).toContain(
      "not the Personal Sandbox buyer"
    );

    confirmRecovery(runtime);
    expect(
      buttonNamed(runtime.tree, "Create replacement Sandbox order")!.props!
        .disabled
    ).toBe(false);
    expect(testState.api.reissueOrder).not.toHaveBeenCalled();
  });

  it("prevents duplicate clicks and says a successful recovery is prepared, not paid", async () => {
    const { project, runtime } = mount();
    openRecovery(runtime);
    confirmRecovery(runtime);

    let resolve!: (value: unknown) => void;
    testState.api.reissueOrder.mockReturnValue(
      new Promise(value => {
        resolve = value;
      })
    );
    const create = buttonNamed(
      runtime.tree,
      "Create replacement Sandbox order"
    )!;
    create.props!.onClick();
    create.props!.onClick();
    expect(testState.api.reissueOrder).toHaveBeenCalledTimes(1);
    expect(testState.api.reissueOrder).toHaveBeenCalledWith(
      project.id,
      project.quote.id,
      project.quote.version
    );

    resolve({
      project,
      approvalUrl: "https://www.sandbox.paypal.com/checkoutnow?token=fresh",
    });
    await Promise.resolve();
    runtime.flush();

    expect(renderedText(runtime.tree)).toContain(
      "Replacement Sandbox order prepared"
    );
    expect(renderedText(runtime.tree)).toContain("It is not paid");
    expect(renderedText(runtime.tree)).toContain(
      "Personal Sandbox buyer account"
    );
    const approvalLink = elementsOfType(runtime.tree, "a").find(link =>
      renderedText(link).includes("Open PayPal Sandbox checkout")
    );
    expect(approvalLink?.props).toMatchObject({
      href: "https://www.sandbox.paypal.com/checkoutnow?token=fresh",
      target: "_blank",
      rel: "noopener noreferrer",
      referrerPolicy: "no-referrer",
      "aria-label": "Open PayPal Sandbox checkout in a new tab",
    });
    expect(renderedText(runtime.tree)).toContain(
      "Use a Sandbox Personal buyer account, not a live PayPal account"
    );
    expect(
      buttonNamed(runtime.tree, "Replacement already prepared")!.props!.disabled
    ).toBe(true);

    buttonNamed(runtime.tree, "Replacement already prepared")!.props!.onClick();
    expect(testState.api.reissueOrder).toHaveBeenCalledTimes(1);
  });

  it("stops with an unknown-status warning instead of claiming no order was created", async () => {
    const { runtime } = mount();
    openRecovery(runtime);
    confirmRecovery(runtime);
    testState.api.reissueOrder.mockRejectedValue(
      new Error("network interrupted")
    );

    buttonNamed(
      runtime.tree,
      "Create replacement Sandbox order"
    )!.props!.onClick();
    await Promise.resolve();
    runtime.flush();

    const text = renderedText(runtime.tree);
    expect(text).toContain("Recovery status is unknown");
    expect(text).toContain("do not create another replacement order");
    expect(text).toContain("Reload the workspace and check Sandbox Activity");
    expect(text).not.toContain("server did not create a replacement order");
    expect(
      buttonNamed(runtime.tree, "Create replacement Sandbox order")!.props!
        .disabled
    ).toBe(true);
  });

  it.each(["NETWORK_ERROR", "SERVICE_UNAVAILABLE", "INVALID_RESPONSE"])(
    "pauses repeat recovery after typed %s uncertainty and retains the stop instruction",
    async code => {
      const { runtime } = mount();
      openRecovery(runtime);
      confirmRecovery(runtime);
      testState.api.reissueOrder.mockRejectedValue(
        new testState.ScopePayApiError("uncertain service response", 502, code)
      );
      buttonNamed(
        runtime.tree,
        "Create replacement Sandbox order"
      )!.props!.onClick();
      await Promise.resolve();
      runtime.flush();
      expect(renderedText(runtime.tree)).toContain("Recovery is paused");
      expect(
        buttonNamed(runtime.tree, "Create replacement Sandbox order")!.props!
          .disabled
      ).toBe(true);
      buttonNamed(runtime.tree, "Hide recovery options")!.props!.onClick();
      runtime.flush();
      openRecovery(runtime);
      expect(renderedText(runtime.tree)).toContain("status is uncertain");
      expect(
        buttonNamed(runtime.tree, "Create replacement Sandbox order")!.props!
          .disabled
      ).toBe(true);
      buttonNamed(
        runtime.tree,
        "Create replacement Sandbox order"
      )!.props!.onClick();
      expect(testState.api.reissueOrder).toHaveBeenCalledTimes(1);
    }
  );
});
