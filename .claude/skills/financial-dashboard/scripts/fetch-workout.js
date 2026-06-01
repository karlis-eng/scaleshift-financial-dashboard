// Reads workout sessions from the Workout Google Sheet (WORKOUT_SHEET_ID).
// Outputs JSON: { sessions, exercises }
const { getAccessToken, apiRequest, loadEnv } = require('./lib/auth');

async function main() {
  loadEnv();
  const sheetId = process.env.WORKOUT_SHEET_ID;
  if (!sheetId) { console.log(JSON.stringify({ sessions: [], exercises: [] })); return; }

  const token = await getAccessToken();
  const res = await apiRequest(token, 'GET',
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Workouts!A2:G`);

  const exercises = (res.values || []).map(r => ({
    date:     r[0] || '',
    day:      r[1] || '',
    exercise: r[2] || '',
    weight:   r[3] === 'BW' ? 'BW' : (parseFloat(r[3]) || 0),
    reps:     parseInt(r[4]) || 0,
    sets:     parseInt(r[5]) || 1,
    notes:    r[6] || '',
  })).filter(r => r.date && r.exercise);

  // Group into sessions by date
  const byDate = {};
  for (const e of exercises) {
    if (!byDate[e.date]) byDate[e.date] = { date: e.date, day: e.day, exercises: [] };
    byDate[e.date].exercises.push(e);
  }
  const sessions = Object.values(byDate).sort((a, b) => b.date.localeCompare(a.date));

  console.log(JSON.stringify({ sessions, exercises }));
}
main().catch(() => { console.log(JSON.stringify({ sessions: [], exercises: [] })); });
