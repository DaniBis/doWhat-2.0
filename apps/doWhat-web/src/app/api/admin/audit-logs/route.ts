import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const MAX_LIMIT = 500;

const parseAllowList = (): string[] =>
  (process.env.NEXT_PUBLIC_ADMIN_EMAILS || '')
    .split(/[ ,]+/)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

const toCsv = (rows: Record<string, unknown>[]) => {
  const headers = ['id', 'actor_email', 'action', 'entity_type', 'entity_id', 'reason', 'details', 'created_at'];
  const escape = (value: unknown) => {
    if (value === null || value === undefined) return '""';
    const str = typeof value === 'object' ? JSON.stringify(value) : String(value);
    const escaped = str.replace(/"/g, '""');
    return `"${escaped}"`;
  };
  const lines = [headers.join(',')];
  rows.forEach((row) => {
    lines.push(headers.map((header) => escape((row as Record<string, unknown>)[header])).join(','));
  });
  return lines.join('\n');
};

export async function GET(req: Request) {
  const supabase = createClient();
  const url = new URL(req.url);
  const format = (url.searchParams.get('format') || 'json').toLowerCase();
  const requestedLimit = Number(url.searchParams.get('limit') || '100');
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), MAX_LIMIT) : 100;
  const allowList = parseAllowList();

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) {
    return NextResponse.json({ error: String(authError) }, { status: 500 });
  }
  const actorEmail = authData?.user?.email?.toLowerCase() ?? null;
  if (!actorEmail || !allowList.includes(actorEmail)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  const { data, error } = await supabase
    .from('admin_audit_logs')
    .select('id,actor_email,action,entity_type,entity_id,reason,details,created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }

  const rows = data ?? [];
  if (format === 'csv') {
    const csv = toCsv(rows as Record<string, unknown>[]);
    return new Response(csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="audit-logs-${Date.now()}.csv"`,
      },
    });
  }

  return NextResponse.json({ logs: rows, count: rows.length, limit });
}
