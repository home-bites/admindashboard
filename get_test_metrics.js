import fs from 'fs';

const configPath = 'C:\\Users\\Sivaji\\.config\\configstore\\firebase-tools.json';

async function getAccessToken() {
  const content = fs.readFileSync(configPath, 'utf8');
  const config = JSON.parse(content);
  return config.tokens.access_token;
}

async function queryMetric(accessToken, metricType, startTimeStr, endTimeStr) {
  const projectId = 'homebites-production-56afa';
  const url = `https://monitoring.googleapis.com/v3/projects/${projectId}/timeSeries`;
  
  const filter = `metric.type="${metricType}"`;
  const queryUrl = `${url}?filter=${encodeURIComponent(filter)}&interval.startTime=${encodeURIComponent(startTimeStr)}&interval.endTime=${encodeURIComponent(endTimeStr)}`;

  const response = await fetch(queryUrl, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to query metric ${metricType}: ${response.statusText} - ${errText}`);
  }

  const data = await response.json();
  return data;
}

function processTimeSeries(data) {
  let total = 0;
  const points = [];
  
  if (data.timeSeries && data.timeSeries.length > 0) {
    for (const series of data.timeSeries) {
      const op = series.metric.labels.op || 'UNKNOWN';
      for (const point of series.points) {
        const value = parseInt(point.value.int64Value || '0', 10);
        total += value;
        points.push({
          time: point.interval.endTime,
          op: op,
          value: value
        });
      }
    }
  }
  
  // Sort points by time ascending
  points.sort((a, b) => new Date(a.time) - new Date(b.time));
  return { total, points };
}

async function run() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.log('Usage: node get_test_metrics.js <startTimeISO> <endTimeISO>');
    console.log('Example: node get_test_metrics.js "2026-06-18T16:00:00Z" "2026-06-18T16:20:00Z"');
    return;
  }
  
  const startTime = args[0];
  const endTime = args[1];
  
  try {
    const token = await getAccessToken();
    
    console.log(`Querying metrics between ${startTime} and ${endTime}...\n`);
    
    const readsData = await queryMetric(token, 'firestore.googleapis.com/document/read_count', startTime, endTime);
    const writesData = await queryMetric(token, 'firestore.googleapis.com/document/write_count', startTime, endTime);
    
    const readsResult = processTimeSeries(readsData);
    const writesResult = processTimeSeries(writesData);
    
    console.log('=== FIRESTORE READS ===');
    console.log('Points:');
    if (readsResult.points.length === 0) {
      console.log('  No read operations recorded in this interval.');
    } else {
      readsResult.points.forEach(p => console.log(`  [${p.time}] OP: ${p.op} | Count: ${p.value}`));
    }
    console.log(`Total Reads Consumed: ${readsResult.total}\n`);
    
    console.log('=== FIRESTORE WRITES ===');
    console.log('Points:');
    if (writesResult.points.length === 0) {
      console.log('  No write operations recorded in this interval.');
    } else {
      writesResult.points.forEach(p => console.log(`  [${p.time}] OP: ${p.op} | Count: ${p.value}`));
    }
    console.log(`Total Writes Consumed: ${writesResult.total}\n`);
    
  } catch (e) {
    console.error('Error running script:', e);
  }
}

run();
