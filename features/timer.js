// Timer feature encapsulation
export function createTimer({ onTimeout, getActiveTestSessionId, getMode }){
  let timer = null;
  let timerDeadline;
  let timeLeftWhenPaused;
  let durationMinutes = 5;

  function stop(){ clearInterval(timer); timer=null; }

  function updateDisplay(){
    if(!getActiveTestSessionId()){ stop(); return; }
    const timeLeftMs = timerDeadline - Date.now();
    const timeLeftSec = Math.round(timeLeftMs/1000);
    if(timeLeftSec<=0){
      const mm = document.getElementById('timer-minutes');
      const ss = document.getElementById('timer-seconds');
      if(mm) mm.textContent = '0';
      if(ss) ss.textContent = '00';
      onTimeout();
      return;
    }
    const m = Math.floor(timeLeftSec/60);
    const s = timeLeftSec%60;
    const mm = document.getElementById('timer-minutes');
    const ss = document.getElementById('timer-seconds');
    if(mm) mm.textContent = m;
    if(ss) ss.textContent = s.toString().padStart(2,'0');
  }

  function start(){
    stop();
    timerDeadline = Date.now() + durationMinutes * 60 * 1000;
    const timerDisplay = document.getElementById('timer-display');
    if(timerDisplay){ timerDisplay.classList.remove('hidden'); timerDisplay.classList.add('flex'); }
    updateDisplay();
    timer = setInterval(updateDisplay,1000);
  }

  function pause(){ if(!timer) return; stop(); timeLeftWhenPaused = timerDeadline - Date.now(); }

  function resume(){
    if(!getActiveTestSessionId() || timer) return;
    const mode = getMode();
    if(mode !== 'exam' && mode !== 'olympiad') return;
    timerDeadline = Date.now() + timeLeftWhenPaused;
    updateDisplay();
    timer = setInterval(updateDisplay,1000);
  }

  function setDuration(minutes){
    durationMinutes = minutes;
  }

  return { start, stop, pause, resume, updateDisplay, setDuration };
}
