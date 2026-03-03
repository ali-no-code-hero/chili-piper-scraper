'use client';

const LOFTY_CAMPAIGN_URL = 'https://lofty.schedulehero.io/campaign/agent-advice-l1';

export default function ScheduleHeroPage() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <div className="flex-none bg-white border-b border-gray-200 px-4 py-3">
        <h1 className="text-lg font-semibold text-gray-900">Lofty – Schedule a call</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Use the scheduler below to pick a time (Central Time).
        </p>
      </div>
      <div className="flex-1 min-h-0 w-full">
        <iframe
          src={LOFTY_CAMPAIGN_URL}
          title="Lofty Scheduler"
          className="w-full h-full min-h-[calc(100vh-120px)] border-0"
          allow="encrypted-media"
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
        />
      </div>
    </div>
  );
}
