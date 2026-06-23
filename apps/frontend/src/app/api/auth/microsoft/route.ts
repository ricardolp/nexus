import { NextResponse } from 'next/server';
import { getServerBackendUrl } from '@/lib/backend-url';

export function GET() {
  return NextResponse.redirect(`${getServerBackendUrl()}/auth/microsoft`);
}
