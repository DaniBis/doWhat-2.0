import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = createClient();
    
    // Delete old sessions (before today)
    const today = new Date().toISOString().split('T')[0];
    const { error: deleteError } = await supabase
      .from('sessions')
      .delete()
      .lt('starts_at', today + 'T00:00:00');
      
    if (deleteError) {
      console.error('Delete error:', deleteError);
    }
    
    // Get current session count
    const { count } = await supabase
      .from('sessions')
      .select('*', { count: 'exact', head: true });
      
    return NextResponse.json({ 
      message: 'Cleaned old sessions',
      current_sessions: count 
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
