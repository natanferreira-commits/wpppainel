// Casas de aposta usadas no painel. Centralizado aqui pra:
//   - Reutilizar no select de Nova Mensagem e Editar Agendada
//   - Validação Zod no backend (POST/PATCH /messages)
//   - Renderização no histórico com cores/badges consistentes
//
// Pra adicionar uma casa nova, só incluir aqui — sem precisar mexer
// em form, schema do banco (é String?) ou histórico.

export const BETTING_HOUSES = [
  'EsportivaBet',
  'Stake',
  'BetMGM',
  'Novibet',
  'Lottu',
  'Superbet',
] as const;

export type BettingHouse = (typeof BETTING_HOUSES)[number];

export function isValidHouse(value: unknown): value is BettingHouse {
  return (
    typeof value === 'string' &&
    (BETTING_HOUSES as readonly string[]).includes(value)
  );
}
