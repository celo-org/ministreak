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
    expect(screen.getByRole("button", { name: /Continue/i })).toBeInTheDocument();
  });

  it("advances through screens with the arrow and ends with a start button", () => {
    render(<OnboardingCarousel open onDismiss={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Continue/i })); // -> screen 2
    expect(screen.getByText(/Play in 2 steps/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Continue/i })); // -> screen 3
    expect(screen.getByText(/How you win/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Continue/i })); // -> screen 4
    expect(screen.getByText(/Keep your edge/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Start playing/i })).toBeInTheDocument();
  });

  it("calls onDismiss from the final start button", () => {
    const onDismiss = vi.fn();
    render(<OnboardingCarousel open onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));
    fireEvent.click(screen.getByRole("button", { name: /Start playing/i }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("calls onDismiss from Skip", () => {
    const onDismiss = vi.fn();
    render(<OnboardingCarousel open onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole("button", { name: /Skip/i }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("restarts at the first screen when reopened after a close", () => {
    const { rerender } = render(<OnboardingCarousel open onDismiss={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Continue/i })); // -> screen 2
    fireEvent.click(screen.getByRole("button", { name: /Continue/i })); // -> screen 3
    expect(screen.getByText(/How you win/i)).toBeInTheDocument();

    rerender(<OnboardingCarousel open={false} onDismiss={() => {}} />); // close
    rerender(<OnboardingCarousel open onDismiss={() => {}} />); // reopen (e.g. Replay intro)

    expect(screen.getByText(/Welcome to MiniStreak/i)).toBeInTheDocument();
    expect(screen.queryByText(/How you win/i)).not.toBeInTheDocument();
  });
});
