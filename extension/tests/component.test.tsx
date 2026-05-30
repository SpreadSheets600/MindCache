import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RecentSearches } from "../src/components/RecentSearches";
import { SearchBar } from "../src/components/SearchBar";
import { useSearchStore } from "../src/store/searchStore";

describe("MindCache React UI Components", () => {
  beforeEach(() => {
    useSearchStore.getState().clearRecentSearches();
    useSearchStore.getState().setQuery("");
  });

  it("should render RecentSearches lists when searches are populated", () => {
    // Populate store
    useSearchStore.getState().addRecentSearch("FastAPI routing");
    useSearchStore.getState().addRecentSearch("Docker networking");

    const onSelectMock = vi.fn();
    render(<RecentSearches onSearchSelect={onSelectMock} />);

    // Check tags exist
    expect(screen.getByText("Recent")).toBeInTheDocument();
    expect(screen.getByText("FastAPI routing")).toBeInTheDocument();
    expect(screen.getByText("Docker networking")).toBeInTheDocument();

    // Click trigger check
    fireEvent.click(screen.getByText("FastAPI routing"));
    expect(onSelectMock).toHaveBeenCalledWith("FastAPI routing");
  });

  it("should render SearchBar controls and handle user typings", () => {
    const onSettingsMock = vi.fn();
    render(<SearchBar isLoading={false} onSettingsClick={onSettingsMock} />);

    const inputElement = screen.getByPlaceholderText(/Search your memory/i) as HTMLInputElement;
    expect(inputElement).toBeInTheDocument();

    // Type input
    fireEvent.change(inputElement, { target: { value: "kubernetes pods" } });
    expect(useSearchStore.getState().query).toBe("kubernetes pods");
  });
});
