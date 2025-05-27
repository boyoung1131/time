"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function EASetupPage() {
  const [candidateCount, setCandidateCount] = useState(3);
  const [totalRounds, setTotalRounds] = useState(2);
  const [status, setStatus] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const startElection = async () => {
    setLoading(true);
    setStatus(null);
    setTxHash(null);

    try {
      const res = await fetch("/api/election/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateCount, totalRounds }),
      });
      const data = await res.json();
      if (data.success) {
        setStatus("✅ 初始化成功");
        setTxHash(data.txHash);
        setTimeout(() => router.push("/"), 1000);
      } else {
        setStatus(`❌ 初始化失敗：${data.error}`);
      }
    } catch (err: any) {
      setStatus(`❌ 初始化過程發生錯誤：${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-xl mx-auto bg-gray-800 text-white rounded-lg shadow-lg">
      <h1 className="text-3xl font-semibold mb-6 text-center">
        🛠️&nbsp;選舉參數設定
      </h1>

      <div className="flex flex-col space-y-6">
        <label className="flex flex-col">
          <span className="mb-2 text-2xl font-semibold">候選人數：</span>
          <input
            type="number"
            min={1}
            value={candidateCount}
            onChange={(e) => setCandidateCount(+e.target.value)}
            className="p-4 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400"
            placeholder="請輸入候選人數"
          />
        </label>

        <label className="flex flex-col">
          <span className="mb-2 text-2xl font-semibold">回合數：</span>
          <input
            type="number"
            min={1}
            value={totalRounds}
            onChange={(e) => setTotalRounds(+e.target.value)}
            className="p-4 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400"
            placeholder="請輸入回合數"
          />
        </label>
      </div>

      <div className="mt-8 text-center">
        <button
          onClick={startElection}
          disabled={loading}
          className="w-full py-3 bg-blue-600 hover:bg-blue-500 rounded font-medium disabled:opacity-50"
        >
          {loading ? "初始化中…" : "🚀 開始初始化"}
        </button>
      </div>

      {status && <p className="mt-4 text-center">{status}</p>}
      {txHash && (
        <p className="mt-2 break-words text-sm text-center">
          交易哈希：<code>{txHash}</code>
        </p>
      )}
    </div>
  );
}
