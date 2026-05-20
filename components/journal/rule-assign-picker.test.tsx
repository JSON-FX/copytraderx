import { render, screen, fireEvent } from "@testing-library/react";
import { RuleAssignPicker } from "./rule-assign-picker";
import type { PropfirmRule } from "@/lib/types";

const ruleA: PropfirmRule = {
  id: 1, user_id: "user-a", name: "FTMO 100k",
  account_size: 100000, max_daily_loss: 5, daily_loss_type: "percent",
  daily_loss_calc: "balance", max_total_loss: 10, total_loss_type: "percent",
  profit_target: 8, target_type: "percent", min_trading_days: 4, max_trading_days: 30,
  created_at: "2026-05-01T00:00:00Z",
};

const ruleB: PropfirmRule = { ...ruleA, id: 2, name: "MFF 50k" };

describe("RuleAssignPicker", () => {
  it("renders 'Create your first rule' link when userRules is empty", () => {
    render(<RuleAssignPicker subscriptionId={42} userRules={[]} ownerUserId="user-a" returnTo="/dashboard/licenses/1" />);
    const link = screen.getByRole("link", { name: /create your first rule/i });
    expect(link).toHaveAttribute("href", expect.stringContaining("/dashboard/propfirm-rules/new"));
    expect(link.getAttribute("href")).toContain("return_to=%2Fdashboard%2Flicenses%2F1");
  });

  it("renders a Select with the user's rules when there are any", () => {
    render(<RuleAssignPicker subscriptionId={42} userRules={[ruleA, ruleB]} ownerUserId="user-a" returnTo="/dashboard/licenses/1" />);
    fireEvent.click(screen.getByRole("combobox"));
    expect(screen.getByText("FTMO 100k")).toBeInTheDocument();
    expect(screen.getByText("MFF 50k")).toBeInTheDocument();
  });

  it("PATCHes the subscription on save", async () => {
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ subscription: { id: 42, propfirm_rule_id: 1 } }), { status: 200 }),
    );
    render(<RuleAssignPicker subscriptionId={42} userRules={[ruleA]} ownerUserId="user-a" returnTo="/dashboard/licenses/1" />);
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(screen.getByText("FTMO 100k"));
    fireEvent.click(screen.getByRole("button", { name: /assign rule/i }));

    // Allow the transition + fetch to flush
    await screen.findByRole("button", { name: /assign rule/i });

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/subscriptions/42",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ propfirm_rule_id: 1 }),
      }),
    );
    fetchSpy.mockRestore();
  });
});
