import { act, fireEvent, render, screen } from "@testing-library/react";
import type { SavePayload } from "@dowhat/shared";

import SaveToggleButton from "../SaveToggleButton";
import { useSavedActivities } from "@/contexts/SavedActivitiesContext";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

type MockContext = ReturnType<typeof useSavedActivities>;

type MutableContext = MockContext & {
  pendingIds: Set<string>;
  isSaved: jest.Mock;
  toggle: jest.Mock;
};

jest.mock("@/contexts/SavedActivitiesContext", () => ({
  useSavedActivities: jest.fn(),
}));

jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
  usePathname: jest.fn(),
  useSearchParams: jest.fn(),
}));

const mockedUseSavedActivities = useSavedActivities as jest.MockedFunction<typeof useSavedActivities>;
const mockedUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;
const mockedUsePathname = usePathname as jest.MockedFunction<typeof usePathname>;
const mockedUseSearchParams = useSearchParams as jest.MockedFunction<typeof useSearchParams>;
type SearchParamsValue = ReturnType<typeof useSearchParams>;

const createMockRouter = () => ({ push: jest.fn() });

const createContext = (): MutableContext => {
  const value = {
    items: [],
    savedIds: new Set<string>(),
    loading: false,
    error: null,
    refreshing: false,
    pendingIds: new Set<string>(),
    isSaved: jest.fn().mockReturnValue(false),
    save: jest.fn(),
    unsave: jest.fn(),
    toggle: jest.fn(),
    refresh: jest.fn(),
  } as unknown as MutableContext;
  mockedUseSavedActivities.mockReturnValue(value);
  return value;
};

describe("SaveToggleButton", () => {
  let routerMock: ReturnType<typeof createMockRouter>;

  beforeEach(() => {
    jest.clearAllMocks();
    routerMock = createMockRouter();
    mockedUseRouter.mockReturnValue(routerMock as unknown as ReturnType<typeof useRouter>);
    mockedUsePathname.mockReturnValue("/activities");
    mockedUseSearchParams.mockReturnValue(new URLSearchParams() as unknown as SearchParamsValue);
  });

  it("renders nothing when payload is null", () => {
    createContext();
    const { container } = render(<SaveToggleButton payload={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the unsaved label and toggles when clicked", () => {
    const context = createContext();
    const payload: SavePayload = { id: "place-1", name: "Cafe" };

    render(<SaveToggleButton payload={payload} unsavedLabel="Save it" />);

    const button = screen.getByRole("button", { name: "Save it" });
    expect(button).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(button);
    expect(context.toggle).toHaveBeenCalledWith(payload);
  });

  it("shows the saved label when the place is already saved", () => {
    const context = createContext();
    context.isSaved.mockReturnValue(true);
    const payload: SavePayload = { id: "place-2" };

    render(<SaveToggleButton payload={payload} />);

    const button = screen.getByRole("button", { name: "Saved" });
    expect(button).toHaveAttribute("aria-pressed", "true");
  });

  it("disables the button while a toggle is pending", () => {
    const context = createContext();
    const payload: SavePayload = { id: "place-3" };
    context.pendingIds.add(payload.id);

    render(<SaveToggleButton payload={payload} />);

    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toBeDisabled();

    fireEvent.click(button);
    expect(context.toggle).not.toHaveBeenCalled();
  });

  it("redirects to auth when saving requires a session", async () => {
    const context = createContext();
    const payload: SavePayload = { id: "place-4" };
    context.toggle.mockRejectedValueOnce(new Error("Sign in to save places"));

    render(<SaveToggleButton payload={payload} />);

    const button = screen.getByRole("button", { name: "Save" });
    await act(async () => {
      fireEvent.click(button);
      await Promise.resolve();
    });

    expect(routerMock.push).toHaveBeenCalledWith("/auth?redirect=%2Factivities");
  });
});
