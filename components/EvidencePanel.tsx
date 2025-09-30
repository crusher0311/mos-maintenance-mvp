"use client";
export default function EvidencePanel({ evidence }: { evidence?: any }) {
  return (
    <div className='rounded-xl border p-3 text-sm text-neutral-600'>
      <div className='font-medium mb-1'>Evidence</div>
      <pre className='text-xs overflow-auto max-h-64 bg-gray-50 p-2 rounded'>
        {JSON.stringify(evidence ?? {}, null, 2)}
      </pre>
    </div>
  );
}
