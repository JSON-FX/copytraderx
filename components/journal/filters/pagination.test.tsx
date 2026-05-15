import { render, screen, fireEvent } from "@testing-library/react";
import { Pagination } from "./pagination";

describe("Pagination", () => {
  it("shows range indicator and page buttons", () => {
    render(<Pagination total={73} page={2} pageSize={25} onPageChange={() => {}} onPageSizeChange={() => {}} />);
    expect(screen.getByText("Showing 26–50 of 73")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("3")).toBeInTheDocument();
  });
  it("calls onPageChange when a page button is clicked", () => {
    const onPageChange = jest.fn();
    render(<Pagination total={73} page={1} pageSize={25} onPageChange={onPageChange} onPageSizeChange={() => {}} />);
    fireEvent.click(screen.getByText("Next ›"));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });
  it("disables prev on first page and next on last", () => {
    const { rerender } = render(<Pagination total={50} page={1} pageSize={25} onPageChange={() => {}} onPageSizeChange={() => {}} />);
    expect(screen.getByText("‹ Prev")).toBeDisabled();
    rerender(<Pagination total={50} page={2} pageSize={25} onPageChange={() => {}} onPageSizeChange={() => {}} />);
    expect(screen.getByText("Next ›")).toBeDisabled();
  });
});
