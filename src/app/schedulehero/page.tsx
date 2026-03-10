'use client';

import { useSearchParams } from 'next/navigation';

const CAMPAIGN_BASE = 'https://lofty.schedulehero.io/campaign';
const DEFAULT_CAMPAIGN = 'agent-advice-l1';
const ALLOWED_CAMPAIGNS = ['agent-advice-l1', 'agent-advice-l2'] as const;

function getCampaign(param: string | null): string {
  if (param && ALLOWED_CAMPAIGNS.includes(param as (typeof ALLOWED_CAMPAIGNS)[number]))
    return param;
  return DEFAULT_CAMPAIGN;
}

export default function ScheduleHeroPage() {
  const searchParams = useSearchParams();
  const campaign = getCampaign(searchParams.get('campaign'));
  const campaignUrl = `${CAMPAIGN_BASE}/${campaign}`;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <div className="flex-none bg-white border-b border-gray-200 px-4 py-3">
        <h1 className="text-lg font-semibold text-gray-900">Lofty – Schedule a call</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Use the scheduler below to pick a time (Central Time).
        </p>
        <p className="text-xs text-gray-400 mt-1">
          Campaign: {campaign}.{' '}
          <a href="/schedulehero" className="text-blue-600 hover:underline">L1</a>
          {' | '}
          <a href="/schedulehero?campaign=agent-advice-l2" className="text-blue-600 hover:underline">L2</a>
        </p>
      </div>
      <div className="flex-1 min-h-0 w-full">
        <iframe
          src={campaignUrl}
          title="Lofty Scheduler"
          className="w-full h-full min-h-[calc(100vh-120px)] border-0"
          allow="encrypted-media"
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
        />
      </div>
    </div>
  );
}
