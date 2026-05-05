import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

// Helpers compartilhados pra resposta de erro consistente entre handlers.
// Espelha o formato de erro que o NestJS retornava (campo `message`).

export function errorResponse(message: string | string[], status = 400) {
  return NextResponse.json({ message, statusCode: status }, { status });
}

export function fromZodError(err: ZodError) {
  const messages = err.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
  return errorResponse(messages, 400);
}

export function notFound(resource: string) {
  return errorResponse(`${resource} não encontrado(a)`, 404);
}
