import React, { useEffect, useState } from "react";
import { db } from "../firebase/firebaseConfig";
import { collection, query, orderBy, limit, onSnapshot } from "firebase/firestore";

const SecurityDashboard = () => {
  const [auditLogs, setAuditLogs] = useState([]);
  const [threatScores, setThreatScores] = useState([]);
  const [metrics, setMetrics] = useState({
    activeBlocks: 0,
    failedLogins: 0,
    rateLimitTriggers: 0,
    securityIncidents: 0,
  });

  useEffect(() => {
    // Listen for recent audit logs
    const qAudit = query(collection(db, "auditLogs"), orderBy("timestamp", "desc"), limit(25));
    const unsubAudit = onSnapshot(qAudit, (snapshot) => {
      const logs = [];
      snapshot.forEach((doc) => {
        logs.push({ id: doc.id, ...doc.data() });
      });
      setAuditLogs(logs);
      
      // Calculate dynamic quick stats from logs
      let failedLoginsCount = 0;
      let rateLimitCount = 0;
      let securityIncidentsCount = 0;
      
      logs.forEach(log => {
        if (log.action?.includes("LOGIN_FAIL") || log.action?.includes("AUTH_FAIL")) {
          failedLoginsCount++;
        }
        if (log.action?.includes("RATE_LIMIT") || log.action?.includes("EXCEEDED")) {
          rateLimitCount++;
        }
        if (log.action?.includes("THREAT") || log.action?.includes("VIOLATION") || log.action?.includes("LOCK")) {
          securityIncidentsCount++;
        }
      });
      
      setMetrics(prev => ({
        ...prev,
        failedLogins: failedLoginsCount,
        rateLimitTriggers: rateLimitCount,
        securityIncidents: securityIncidentsCount,
      }));
    }, () => {});

    // Listen for threat scores
    const qThreat = query(collection(db, "threatScores"), orderBy("threatScore", "desc"), limit(15));
    const unsubThreat = onSnapshot(qThreat, (snapshot) => {
      const scores = [];
      let blocks = 0;
      snapshot.forEach((doc) => {
        const data = doc.data();
        scores.push({ id: doc.id, ...data });
        if (data.locked || data.threatScore >= 100) {
          blocks++;
        }
      });
      setThreatScores(scores);
      setMetrics(prev => ({ ...prev, activeBlocks: blocks }));
    }, () => {});

    return () => {
      unsubAudit();
      unsubThreat();
    };
  }, []);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <span className="material-symbols-outlined text-[#10b981] text-[28px]">shield</span>
            Enterprise Security Dashboard
          </h2>
          <p className="text-xs text-slate-500 mt-1">Real-time threat monitoring and defense-in-depth platform analytics.</p>
        </div>
        <div className="flex items-center gap-2 bg-[#10b981]/5 border border-[#10b981]/10 px-3.5 py-1.5 rounded-lg">
          <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse"></span>
          <span className="text-xs font-bold text-[#10b981]">ACTIVE MONITOR ENGAGED</span>
        </div>
      </div>

      {/* Grid Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-red-50 flex items-center justify-center text-red-600">
            <span className="material-symbols-outlined text-[28px]">block</span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Active Device Blocks</span>
            <span className="text-2xl font-black text-slate-800">{metrics.activeBlocks}</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
            <span className="material-symbols-outlined text-[28px]">gpp_bad</span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Failed Logins (24h)</span>
            <span className="text-2xl font-black text-slate-800">{metrics.failedLogins}</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
            <span className="material-symbols-outlined text-[28px]">speed</span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Rate Limit Triggers</span>
            <span className="text-2xl font-black text-slate-800">{metrics.rateLimitTriggers}</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-purple-50 flex items-center justify-center text-purple-600">
            <span className="material-symbols-outlined text-[28px]">policy</span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Security Incidents</span>
            <span className="text-2xl font-black text-slate-800">{metrics.securityIncidents}</span>
          </div>
        </div>
      </div>

      {/* Main Content Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Audit Logs Table */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col h-[500px]">
          <h3 className="font-bold text-slate-800 text-sm mb-4 flex items-center gap-2 border-b pb-2">
            <span className="material-symbols-outlined text-slate-500">list_alt</span>
            System Security Audit Logs
          </h3>
          <div className="flex-grow overflow-y-auto space-y-3.5 pr-2">
            {auditLogs.map((log) => (
              <div key={log.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-slate-700">{log.action || "SECURITY_ACTION"}</span>
                  <span className="text-[10px] text-slate-400">
                    {log.timestamp?.toDate ? log.timestamp.toDate().toLocaleString() : new Date(log.timestamp).toLocaleString()}
                  </span>
                </div>
                <div className="text-slate-500 flex justify-between">
                  <span>User: <strong className="text-slate-700">{log.userId || "System/Guest"}</strong></span>
                  <span>Module: <strong className="text-slate-700">{log.module || "Security"}</strong></span>
                </div>
                {log.metadata && Object.keys(log.metadata).length > 0 && (
                  <pre className="text-[10px] bg-slate-800 text-green-400 p-2 rounded overflow-x-auto font-mono mt-1 leading-normal">
                    {JSON.stringify(log.metadata, null, 2)}
                  </pre>
                )}
              </div>
            ))}
            {auditLogs.length === 0 && (
              <div className="text-center py-12 text-xs text-slate-400 font-medium">
                No security audit logs found.
              </div>
            )}
          </div>
        </div>

        {/* Threat Scores and Blocks */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col h-[500px]">
          <h3 className="font-bold text-slate-800 text-sm mb-4 flex items-center gap-2 border-b pb-2">
            <span className="material-symbols-outlined text-red-500">gpp_maybe</span>
            Flagged Threat Profiles
          </h3>
          <div className="flex-grow overflow-y-auto divide-y divide-slate-100 pr-1">
            {threatScores.map((score) => (
              <div key={score.id} className="py-3 flex justify-between items-center text-xs">
                <div className="min-w-0 pr-3">
                  <span className="font-bold text-slate-800 block truncate">{score.uid}</span>
                  <span className="text-[10px] text-slate-400">
                    Last active: {score.updatedAt?.toDate ? score.updatedAt.toDate().toLocaleTimeString() : new Date(score.updatedAt).toLocaleTimeString()}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                    score.threatScore >= 100
                      ? "bg-red-100 text-red-700 border border-red-200"
                      : score.threatScore >= 50
                      ? "bg-amber-100 text-amber-700 border border-amber-200"
                      : "bg-slate-100 text-slate-700 border border-slate-200"
                  }`}>
                    Score: {score.threatScore}
                  </span>
                </div>
              </div>
            ))}
            {threatScores.length === 0 && (
              <div className="text-center py-12 text-xs text-slate-400 font-medium">
                No flagged threat profiles.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SecurityDashboard;
