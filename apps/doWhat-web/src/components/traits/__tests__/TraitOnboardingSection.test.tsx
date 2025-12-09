import { render, screen, fireEvent } from '@testing-library/react';

import { TraitOnboardingSection } from '@/components/traits/TraitOnboardingSection';

const pushMock = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

type MockSelectorProps = {
  onCompleted?: () => void;
};

jest.mock('@/components/traits/TraitSelector', () => ({
  TraitSelector: ({ onCompleted }: MockSelectorProps) => (
    <button type="button" onClick={onCompleted}>
      Finish onboarding
    </button>
  ),
}));

describe('TraitOnboardingSection', () => {
  beforeEach(() => {
    pushMock.mockReset();
  });

  it('redirects to the default profile path when onboarding completes', () => {
    render(<TraitOnboardingSection />);

    fireEvent.click(screen.getByRole('button', { name: /finish onboarding/i }));

    expect(pushMock).toHaveBeenCalledWith('/profile?onboarding=traits');
  });

  it('redirects to a custom path when provided', () => {
    render(<TraitOnboardingSection redirectPath="/profile?tab=traits" />);

    fireEvent.click(screen.getByRole('button', { name: /finish onboarding/i }));

    expect(pushMock).toHaveBeenCalledWith('/profile?tab=traits');
  });
});
