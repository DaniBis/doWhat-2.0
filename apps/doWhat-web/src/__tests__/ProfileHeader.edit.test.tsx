import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { supabase } from '@/lib/supabase/browser';

// Mock crypto.randomUUID
Object.defineProperty(global, 'crypto', {
  value: { randomUUID: () => 'uuid-test' }
});

// Mock supabase storage
const uploadMock = jest.fn();
const getPublicUrlMock = jest.fn().mockReturnValue({ data: { publicUrl: 'https://cdn.example.com/avatars/uuid-test.png' } });

jest.mock('@/lib/supabase/browser', () => ({
  supabase: {
    storage: {
  from: jest.fn(() => ({
        upload: uploadMock,
        getPublicUrl: getPublicUrlMock,
      }))
    }
  }
}));

describe('ProfileHeader editing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('opens edit modal and saves new name', async () => {
    const onUpdated = jest.fn();
    const { getByText, getByPlaceholderText, queryByText } = render(
      <ProfileHeader name="Old Name" editable onProfileUpdated={onUpdated} />
    );
    fireEvent.click(getByText('Edit'));
    expect(getByText('Edit Profile')).toBeInTheDocument();
    const input = getByPlaceholderText('Your name') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'New Name' } });
    fireEvent.click(getByText('Save'));
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(expect.objectContaining({ name: 'New Name' })));
    expect(queryByText('Edit Profile')).not.toBeInTheDocument();
  });

  it('uploads avatar and calls onProfileUpdated with avatarUrl', async () => {
    uploadMock.mockResolvedValueOnce({ error: null }); // avatars bucket succeeds
    const onUpdated = jest.fn();
    const { getByText, container } = render(
      <ProfileHeader name="User" editable onProfileUpdated={onUpdated} />
    );
    // Hover state not needed; just trigger hidden input via click handler
    fireEvent.click(getByText('Change'));
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['avatar'], 'avatar.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [file] } });
    await waitFor(() => expect(uploadMock).toHaveBeenCalled());
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith({ avatarUrl: 'https://cdn.example.com/avatars/uuid-test.png' }));
  });

  it('edits instagram & whatsapp and saves', async () => {
    const onUpdated = jest.fn();
    const { getByText, container } = render(
      <ProfileHeader name="User" editable socials={{ instagram: 'oldgram', whatsapp: '+15551234567' }} onProfileUpdated={onUpdated} />
    );
    fireEvent.click(getByText('Edit'));
    const ig = container.querySelector('input[placeholder="yourgram"]') as HTMLInputElement;
    fireEvent.change(ig, { target: { value: 'newgram' } });
    const wa = container.querySelector('input[placeholder="+1234567890"]') as HTMLInputElement;
    fireEvent.change(wa, { target: { value: '+441234567890' } });
    fireEvent.click(getByText('Save'));
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(expect.objectContaining({ socials: expect.objectContaining({ instagram: 'newgram', whatsapp: '+441234567890' }) })));
  });

  it('shows error message if upload fails (error banner visible only in edit modal)', async () => {
    const failingUpload = jest.fn().mockResolvedValue({ error: new Error('fail') });
    (supabase.storage.from as jest.Mock).mockImplementationOnce(() => ({
      upload: failingUpload,
      getPublicUrl: getPublicUrlMock,
    })).mockImplementationOnce(() => ({ // second bucket attempt also fails
      upload: failingUpload,
      getPublicUrl: getPublicUrlMock,
    }));
    const { getByText, container, findAllByText } = render(
      <ProfileHeader name="User" editable onProfileUpdated={jest.fn()} />
    );
    // Open edit modal so errorMsg area is rendered when upload fails
    fireEvent.click(getByText('Edit'));
    fireEvent.click(getByText('Change'));
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['avatar'], 'avatar.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [file] } });
  const errorMessages = await findAllByText(/Failed to upload image/i);
    expect(errorMessages.length).toBeGreaterThan(0);
  });
});
