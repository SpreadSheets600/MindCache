import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import App from "../src/settings/App";

vi.mock("../src/services/BackendClient", () => ({
  backendClient: { checkHealth: vi.fn().mockRejectedValue(new Error("offline")) },
}));

describe("shared web dashboard", () => {
  it("opens the original overview and keeps model setup in the same shell", async () => {
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><App /></QueryClientProvider>);
    expect(screen.getByText("Your memory at a glance")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Documents" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Library" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByTitle("privacy workspace")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Models" }));
    const frame = screen.getByTitle("models workspace") as HTMLIFrameElement;
    expect(frame).toHaveAttribute("src", "/app/workspace.html?embedded=1&view=models");
    fireEvent(window, new MessageEvent("message", { origin: window.location.origin, source: frame.contentWindow, data: { type: "mindcache:resize", height: 1200 } }));
    expect(frame).toHaveStyle({ height: "1200px" });
    fireEvent.click(screen.getByRole("button", { name: "Knowledge Graph" }));
    expect(screen.getByText("Knowledge Graph", { selector: "h1" })).toBeInTheDocument();
  });
});
