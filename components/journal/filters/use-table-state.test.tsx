import { renderHook, act } from "@testing-library/react";
import { useTableState } from "./use-table-state";

describe("useTableState", () => {
  it("starts with defaults", () => {
    const { result } = renderHook(() => useTableState({ defaultSort: "closed_desc", defaultSize: 25 }));
    expect(result.current.state.sort).toBe("closed_desc");
    expect(result.current.state.page).toBe(1);
    expect(result.current.state.size).toBe(25);
    expect(result.current.state.filters).toEqual({});
    expect(result.current.state.search).toBe("");
  });
  it("setFilter resets page to 1", () => {
    const { result } = renderHook(() => useTableState({ defaultSort: "closed_desc", defaultSize: 25 }));
    act(() => result.current.setPage(3));
    expect(result.current.state.page).toBe(3);
    act(() => result.current.setFilter("symbol", "GBPUSD"));
    expect(result.current.state.page).toBe(1);
    expect(result.current.state.filters.symbol).toBe("GBPUSD");
  });
  it("setSort flips direction on same key", () => {
    const { result } = renderHook(() => useTableState({ defaultSort: "closed_desc", defaultSize: 25 }));
    act(() => result.current.setSort("closed"));
    expect(result.current.state.sort).toBe("closed_asc");
    act(() => result.current.setSort("closed"));
    expect(result.current.state.sort).toBe("closed_desc");
  });
  it("setSearch resets page to 1", () => {
    const { result } = renderHook(() => useTableState({ defaultSort: "closed_desc", defaultSize: 25 }));
    act(() => result.current.setPage(2));
    act(() => result.current.setSearch("ABC"));
    expect(result.current.state.page).toBe(1);
    expect(result.current.state.search).toBe("ABC");
  });
});
