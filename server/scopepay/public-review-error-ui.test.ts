import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  class MockScopePayApiError extends Error {
    constructor(
      message: string,
      public status: number,
      public code?: string
    ) {
      super(message);
    }
  }
  return {
    values: [] as unknown[],
    index: 0,
    api: {
      clientReview: vi.fn(),
      status: vi.fn(),
      createOrder: vi.fn(),
      captureOrder: vi.fn(),
      acceptClientDocument: vi.fn(),
    },
    ScopePayApiError: MockScopePayApiError,
  };
});

vi.mock("../../client/src/lib/scopepay-api", () => ({
  scopepayApi: state.api,
  ScopePayApiError: state.ScopePayApiError,
}));

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useState: (initial: unknown) => {
      const index = state.index++;
      if (!(index in state.values)) state.values[index] = initial;
      return [
        state.values[index],
        (next: unknown) => {
          state.values[index] = next;
        },
      ];
    },
    useCallback: (fn: unknown) => fn,
    useEffect: () => undefined,
    useRef: (value: unknown) => ({ current: value }),
  };
});

import * as React from "react";
import { PublicReviewPage } from "../../client/src/pages/PublicReviewPage";
(globalThis as any).React = React;

type Element = { type?: unknown; props?: Record<string, any> };
function text(value: unknown): string {
  if (value == null || typeof value === "boolean") return "";
  if (typeof value === "string" || typeof value === "number")
    return String(value);
  if (Array.isArray(value)) return value.map(text).join("");
  return text((value as Element).props?.children);
}
function elements(value: unknown): Element[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(elements);
  const e = value as Element;
  return e.props ? [e, ...elements(e.props.children)] : [];
}
function renderError(code?: string) {
  // State order: review, service status, accepted, accepting, loading, error,
  // load error code. Remaining notices use their normal initial values.
  state.values = [null, null, false, false, false, "Safe review error", code];
  state.index = 0;
  return PublicReviewPage({ token: "fictional-client-capability" });
}

afterEach(() => {
  for (const mock of Object.values(state.api)) mock.mockReset();
  state.values = [];
  state.index = 0;
});

describe("Public review loading error boundaries", () => {
  it.each(["CLIENT_LINK_NOT_FOUND", "CLIENT_TOKEN_NOT_FOUND"] as const)(
    "shows an unavailable link without checkout or retry controls for %s",
    code => {
      const tree = renderError(code);
      expect(text(tree)).toContain("This review link is unavailable.");
      expect(elements(tree).filter(e => e.type === "button")).toHaveLength(0);
      expect(state.api.clientReview).not.toHaveBeenCalled();
      expect(state.api.createOrder).not.toHaveBeenCalled();
      expect(state.api.captureOrder).not.toHaveBeenCalled();
      expect(state.api.acceptClientDocument).not.toHaveBeenCalled();
    }
  );

  it("offers a read-only retry instead of calling a transient database error an invalid link", async () => {
    const tree = renderError("DATABASE_UNAVAILABLE");
    expect(text(tree)).toContain("We couldn’t load this review.");
    expect(text(tree)).not.toContain("This review link is unavailable.");
    const retry = elements(tree).find(e => e.type === "button");
    expect(text(retry)).toContain("Retry loading this review");
    state.api.clientReview.mockRejectedValue(
      new state.ScopePayApiError(
        "Saved records are unavailable",
        503,
        "DATABASE_UNAVAILABLE"
      )
    );
    state.api.status.mockResolvedValue({ environment: "sandbox" });
    retry!.props!.onClick();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(state.api.clientReview).toHaveBeenCalledTimes(1);
    expect(state.api.status).toHaveBeenCalledTimes(1);
    expect(state.api.createOrder).not.toHaveBeenCalled();
    expect(state.api.captureOrder).not.toHaveBeenCalled();
    expect(state.api.acceptClientDocument).not.toHaveBeenCalled();
  });
});
