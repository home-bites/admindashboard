import fs from 'fs';
import path from 'path';

const configPath = 'C:\\Users\\Sivaji\\.config\\configstore\\firebase-tools.json';

async function getAccessToken() {
  const content = fs.readFileSync(configPath, 'utf8');
  const config = JSON.parse(content);
  return config.tokens.access_token;
}

async function queryMetric(accessToken, metricType) {
  const projectId = 'homebites-production';
  const url = `https://monitoring.googleapis.com/v3/projects/${projectId}/timeSeries`;
  
  // Set time interval: last 30 minutes
  const now = new Date();
  const startTime = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
  const endTime = now.toISOString();

  const filter = `metric.type="${metricType}"`;
  
  const queryUrl = `${url}?filter=${encodeURIComponent(filter)}&interval.startTime=${encodeURIComponent(startTime)}&interval.endTime=${encodeURIComponent(endTime)}`;

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

async function run() {
  try {
    const token = await getAccessToken();
    console.log('Got access token successfully.');
    
    console.log('\nQuerying Firestore Reads (last 30 mins)...');
    const readsData = await queryMetric(token, 'firestore.googleapis.com/document/read_count');
    console.log(JSON.stringify(readsData, null, 2));

    console.log('\nQuerying Firestore Writes (last 30 mins)...');
    const writesData = await queryMetric(token, 'firestore.googleapis.com/document/write_count');
    console.log(JSON.stringify(writesData, null, 2));
    
  } catch (e) {
    console.error('Error running script:', e);
  }
}

run();
