import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { activeSession, staleSessions, isTimerDone } from './crash/protocol.js';
import { mergeKit } from './crash/crashKit.js';
import CrashHome from './crash/CrashHome.jsx';
import ProtocolRunner from './crash/ProtocolRunner.jsx';
import ParkThought from './crash/ParkThought.jsx';
import AnchorsView from './crash/AnchorsView.jsx';
import DraftsView from './crash/DraftsView.jsx';
import HistoryView from './crash/HistoryView.jsx';
import KitSetup from './crash/KitSetup.jsx';
import { sendNotification } from '../utils/notifications';

export default function CrashProtocol() {
  const {
    crashSessions, crashKit, notifPrefs,
    startCrashSession, updateCrashSession, endCrashSession,
  } = useApp();
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState('home');
  const [running, setRunning] = useState(false);
  const [parking, setParking] = useState(false);
  // Anchors can be reached two ways — from the home screen, or from Round 6 of
  // a live round. Back has to go where you actually came from, not merely
  // wherever a session happens to be open.
  const [cameFromRunner, setCameFromRunner] = useState(false);

  const kit = mergeKit(crashKit);
  const active = useMemo(() => activeSession(crashSessions), [crashSessions]);

  // A session left open overnight isn't live any more; close it out quietly so
  // it stops offering to resume.
  useEffect(() => {
    for (const s of staleSessions(crashSessions)) {
      endCrashSession(s.id, { outcome: s.outcome || null });
    }
  }, [crashSessions, endCrashSession]);

  // Deep link from the Dashboard tile: /crash?start=1 goes straight in.
  useEffect(() => {
    if (params.get('start') !== '1') return;
    setParams({}, { replace: true });
    if (active) setRunning(true);
    else { startCrashSession(); setRunning(true); }
  }, [params, setParams, active, startCrashSession]);

  // One buzz when the 30 minutes are up, saying only that.
  useEffect(() => {
    if (!active || !kit.notifyOnTimerEnd || notifPrefs.crash?.timerEnd === false) return undefined;
    const left = active.timerEndsAt - Date.now();
    if (left <= 0) return undefined;
    const id = setTimeout(() => {
      sendNotification('Your time is up', {
        body: 'Come back when you’re ready. Nothing had to be solved before now.',
        tag: `crash-${active.id}`,
      });
    }, left);
    return () => clearTimeout(id);
  }, [active, kit.notifyOnTimerEnd, notifPrefs.crash?.timerEnd]);

  // Coming back after the timer ran out lands on closing the loop, not on
  // whichever step was open when the phone got put down.
  const resume = () => {
    if (active && isTimerDone(active) && active.step !== 'close') {
      updateCrashSession(active.id, { step: 'close' });
    }
    setRunning(true);
  };

  if (running && active) {
    return (
      <ProtocolRunner
        session={active}
        onExit={() => setRunning(false)}
        onOpenAnchors={() => { setRunning(false); setCameFromRunner(true); setView('anchors'); }}
      />
    );
  }

  const back = () => { setView('home'); setCameFromRunner(false); };

  return (
    <>
      {view === 'home' && (
        <CrashHome
          active={active}
          onStart={() => { startCrashSession(); setRunning(true); }}
          onResume={resume}
          onPark={() => setParking(true)}
          onGo={(v) => { setCameFromRunner(false); setView(v); }}
        />
      )}
      {view === 'anchors' && (
        <AnchorsView
          onBack={cameFromRunner && active ? () => { setCameFromRunner(false); setRunning(true); } : back}
        />
      )}
      {view === 'drafts' && <DraftsView onBack={back} />}
      {view === 'history' && <HistoryView onBack={back} />}
      {view === 'setup' && <KitSetup onBack={back} />}

      {parking && <ParkThought onClose={() => setParking(false)} />}
    </>
  );
}
