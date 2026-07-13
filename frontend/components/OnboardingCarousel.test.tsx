import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import OnboardingCarousel from "./OnboardingCarousel";

describe("OnboardingCarousel", () => {
  it("renders nothing when closed", () => {
    const { container } = render(<OnboardingCarousel open={false} onDismiss={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the first screen when open", () => {
    render(<OnboardingCarousel open onDismiss={() => {}} />);
    expect(screen.getByText(/Welcome to MiniStreak/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Next/i })).toBeInTheDocument();
  });

  it("advances through screens with Next and ends with Get started", () => {
    render(<OnboardingCarousel open onDismiss={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Next/i })); // -> screen 2
    expect(screen.getByText(/Play in 2 steps/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Next/i })); // -> screen 3
    expect(screen.getByText(/How you win/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Next/i })); // -> screen 4
    expect(screen.getByText(/Keep your edge/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Get started/i })).toBeInTheDocument();
  });

  it("calls onDismiss from the final Get started", () => {
    const onDismiss = vi.fn();
    render(<OnboardingCarousel open onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    fireEvent.click(screen.getByRole("button", { name: /Get started/i }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("calls onDismiss from Skip", () => {
    const onDismiss = vi.fn();
    render(<OnboardingCarousel open onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole("button", { name: /Skip/i }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
