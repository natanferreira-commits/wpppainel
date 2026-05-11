export default function CalendarioPage() {
  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-100">Calendário</h1>
        <p className="text-sm text-slate-400">Visão semanal das mensagens agendadas.</p>
      </header>
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center">
        <p className="text-sm text-slate-400">📅 Em construção — entra no Round 3.</p>
        <p className="text-xs text-slate-500 mt-2">
          Por enquanto, use a tela <a className="text-emerald-400 hover:underline" href="/agendadas">Agendadas</a> pra
          ver agendamentos com countdown ao vivo.
        </p>
      </div>
    </div>
  );
}
