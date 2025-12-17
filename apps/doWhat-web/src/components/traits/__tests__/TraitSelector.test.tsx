import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { TraitSelector } from '@/components/traits/TraitSelector';
import { MAX_ONBOARDING_TRAITS } from '@/lib/validation/traits';
import type { TraitOption } from '@/types/traits';
import { completeTraitOnboardingAction } from '@/app/actions/traits';

jest.mock('@/app/actions/traits', () => ({
  completeTraitOnboardingAction: jest.fn(),
}));

const traitResponseState: { data: TraitOption[]; error: null | { message: string } } = {
  data: [],
  error: null,
};

jest.mock('@/lib/supabase/browser', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        order: jest.fn(async () => ({ ...traitResponseState })),
      })),
    })),
  },
  __setTraitCatalog: (traits: TraitOption[]) => {
    traitResponseState.data = traits;
    traitResponseState.error = null;
  },
}));

const { __setTraitCatalog } = jest.requireMock('@/lib/supabase/browser') as {
  __setTraitCatalog: (traits: TraitOption[]) => void;
};

const mockAction = completeTraitOnboardingAction as jest.MockedFunction<typeof completeTraitOnboardingAction>;

const buildTraits = (count: number): TraitOption[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `trait-${index + 1}`,
    name: `Trait ${index + 1}`,
    color: '#10B981',
    icon: 'spark',
  }));

const clickTraitCard = async (name: string) => {
  const buttons = await screen.findAllByRole('button', { name: new RegExp(name, 'i') });
  const card = buttons.find((button) => button.getAttribute('aria-pressed') !== null);
  if (!card) {
    throw new Error(`Trait card for ${name} not found`);
  }
  fireEvent.click(card);
};

describe('TraitSelector', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __setTraitCatalog(buildTraits(MAX_ONBOARDING_TRAITS + 1));
    mockAction.mockResolvedValue({ ok: true });
  });

  it('loads traits and enforces the selection limit', async () => {
    render(<TraitSelector />);

    await screen.findByText('Trait 1');

    const saveButton = screen.getByRole('button', { name: /save traits/i });
    expect(saveButton).toBeDisabled();

    for (let i = 1; i <= MAX_ONBOARDING_TRAITS; i += 1) {
      await clickTraitCard(`Trait ${i}`);
    }

    await waitFor(() => expect(saveButton).toBeEnabled());
    expect(screen.getByText('All set! Save to continue.')).toBeInTheDocument();

    const extraTraitButtons = await screen.findAllByRole('button', {
      name: new RegExp(`Trait ${MAX_ONBOARDING_TRAITS + 1}`, 'i'),
    });
    const extraTraitButton = extraTraitButtons.find((button) => button.getAttribute('aria-pressed') !== null);
    expect(extraTraitButton).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(extraTraitButton as HTMLElement);
    expect(extraTraitButton).toHaveAttribute('aria-pressed', 'false');
  });

  it('submits the selected traits and fires callbacks', async () => {
    const handleCompleted = jest.fn();
    render(<TraitSelector onCompleted={handleCompleted} />);

    for (let i = 1; i <= MAX_ONBOARDING_TRAITS; i += 1) {
      await clickTraitCard(`Trait ${i}`);
    }

    fireEvent.click(screen.getByRole('button', { name: /save traits/i }));

    await waitFor(() => expect(mockAction).toHaveBeenCalledTimes(1));
    expect(mockAction).toHaveBeenCalledWith({
      traitIds: Array.from({ length: MAX_ONBOARDING_TRAITS }, (_, index) => `trait-${index + 1}`),
    });

    await waitFor(() => expect(handleCompleted).toHaveBeenCalled());
    expect(screen.getByText(/traits saved/i)).toBeInTheDocument();
  });

  it('lets members deselect traits to edit their stack', async () => {
    render(<TraitSelector />);

    const saveButton = screen.getByRole('button', { name: /save traits/i });

    await clickTraitCard('Trait 1');
    await clickTraitCard('Trait 2');
    await clickTraitCard('Trait 3');

    expect(screen.getByText('Select 2 more traits.')).toBeInTheDocument();
    expect(saveButton).toBeDisabled();

    await clickTraitCard('Trait 2');

    expect(screen.getByText('Select 3 more traits.')).toBeInTheDocument();
    expect(saveButton).toBeDisabled();
  });
});
