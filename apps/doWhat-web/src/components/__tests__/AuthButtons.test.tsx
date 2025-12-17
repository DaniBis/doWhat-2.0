import { act, render, screen } from "@testing-library/react";
import AuthButtons from "@/components/AuthButtons";

jest.mock("@/lib/supabase/browser", () => {
  const pending = new Promise(() => {});
  return {
    supabase: {
      auth: {
        getUser: jest.fn(() => pending),
        signInWithOAuth: jest.fn(() => Promise.resolve({ error: null })),
        onAuthStateChange: jest.fn(() => ({
          data: { subscription: { unsubscribe: jest.fn() } },
        })),
      },
    },
  };
});

describe("AuthButtons", () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it("shows auth options if session check stalls", async () => {
    jest.useFakeTimers();
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    render(<AuthButtons variant="panel" intent="signin" />);

    expect(screen.getByText(/Checking your session/i)).toBeInTheDocument();

    await act(async () => {
      jest.advanceTimersByTime(6000);
    });

    expect(await screen.findByText(/Continue with Google/i)).toBeInTheDocument();

    warnSpy.mockRestore();
  });
});
