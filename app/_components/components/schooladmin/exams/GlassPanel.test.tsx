import { render, screen } from "@testing-library/react";
import GlassPanel from "@/components/ui/GlassPanel";

describe("GlassPanel", () => {
  it("renders children", () => {
    render(<GlassPanel>Panel content</GlassPanel>);
    expect(screen.getByText("Panel content")).toBeInTheDocument();
  });

  it("applies padding class for padding prop", () => {
    const { container } = render(<GlassPanel padding="sm">Content</GlassPanel>);
    const div = container.firstChild as HTMLElement;
    expect(div.className).toContain("p-4");
  });

  it("applies lg padding when padding=lg", () => {
    const { container } = render(<GlassPanel padding="lg">Content</GlassPanel>);
    const div = container.firstChild as HTMLElement;
    expect(div.className).toContain("p-8");
  });

  it("merges custom className", () => {
    const { container } = render(<GlassPanel className="custom-class">Content</GlassPanel>);
    const div = container.firstChild as HTMLElement;
    expect(div.className).toContain("custom-class");
  });
});
