import { NextResponse } from 'next/server';
import { backendFetch } from '@/lib/server-backend';

export async function GET() {
  try {
    const backendResponse = await backendFetch('/auth/me');

    if (!backendResponse.ok) {
      return NextResponse.json({ message: 'Não autenticado' }, { status: 401 });
    }

    const user = await backendResponse.json();
    return NextResponse.json(user);
  } catch {
    return NextResponse.json({ message: 'Não autenticado' }, { status: 401 });
  }
}
