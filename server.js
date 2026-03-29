const client = require('prom-client');

// collect default metrics
client.collectDefaultMetrics();

const express = require('express');
const path = require('path');

const httpRequestCounter = new client.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP Requests'
});

const bodyParser = require('body-parser');
const { grievanceDB, leaveDB, timetableDB, examsDB } = require('./db'); // ✅ added examsDB

const app = express();
const PORT = 3000;

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use((req, res, next) => {
  httpRequestCounter.inc();
  next();
});
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

// Database health check endpoint
app.get('/health', (req, res) => {
  const checks = {
    grievance_db: false,
    leave_db: false,
    timetable_db: false,
    exams_db: false
  };
  
  let completedChecks = 0;
  const totalChecks = 4;
  
  function checkComplete() {
    completedChecks++;
    if (completedChecks === totalChecks) {
      const allHealthy = Object.values(checks).every(status => status === true);
      res.status(allHealthy ? 200 : 500).json({
        status: allHealthy ? 'healthy' : 'unhealthy',
        databases: checks,
        timestamp: new Date().toISOString()
      });
    }
  }
  
  // Test each database connection
  grievanceDB.getConnection((err, connection) => {
    checks.grievance_db = !err;
    if (connection) connection.release();
    checkComplete();
  });
  
  leaveDB.getConnection((err, connection) => {
    checks.leave_db = !err;
    if (connection) connection.release();
    checkComplete();
  });
  
  timetableDB.getConnection((err, connection) => {
    checks.timetable_db = !err;
    if (connection) connection.release();
    checkComplete();
  });
  
  examsDB.getConnection((err, connection) => {
    checks.exams_db = !err;
    if (connection) connection.release();
    checkComplete();
  });
});

// ------------------------ SERVE HTML PAGES ------------------------ //
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'main.html')));
app.get('/home', (req, res) => res.sendFile(path.join(__dirname, 'public', 'home.html')));
app.get('/home1', (req, res) => res.sendFile(path.join(__dirname, 'public', 'home1.html')));
app.get('/timetable', (req, res) => res.sendFile(path.join(__dirname, 'public', 'timetable.html')));
app.get('/timetable1', (req, res) => res.sendFile(path.join(__dirname, 'public', 'timetable1.html')));
app.get('/exams', (req, res) => res.sendFile(path.join(__dirname, 'public', 'exams.html')));   // ✅ student exam page
app.get('/exams1', (req, res) => res.sendFile(path.join(__dirname, 'public', 'exams1.html'))); // ✅ admin exam page
app.get('/leave', (req, res) => res.sendFile(path.join(__dirname, 'public', 'leave.html')));
app.get('/leavelogs', (req, res) => res.sendFile(path.join(__dirname, 'public', 'leavelogs.html')));
app.get('/grievance', (req, res) => res.sendFile(path.join(__dirname, 'public', 'grievance.html')));
app.get('/grievance1', (req, res) => res.sendFile(path.join(__dirname, 'public', 'grievance1.html')));
app.get('/attendance', (req, res) => res.sendFile(path.join(__dirname, 'public', 'attendance.html')));
app.get('/attendance1', (req, res) => res.sendFile(path.join(__dirname, 'public', 'attendance1.html')));

// ------------------------ GRIEVANCE ROUTES ------------------------ //
app.get('/grievances', (req, res) => {
  const query = 'SELECT * FROM grievances ORDER BY submitted_at DESC';
  grievanceDB.query(query, (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(results);
  });
});

app.get('/grievance-status', (req, res) => {
  const query = 'SELECT * FROM grievances WHERE status = "accepted" ORDER BY submitted_at DESC';
  grievanceDB.query(query, (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(results);
  });
});

app.get('/grievance-rejected', (req, res) => {
  const query = 'SELECT * FROM grievances WHERE status = "rejected" ORDER BY submitted_at DESC';
  grievanceDB.query(query, (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(results);
  });
});

app.get('/grievance-pending', (req, res) => {
  const query = 'SELECT * FROM grievances WHERE status = "pending" ORDER BY submitted_at DESC';
  grievanceDB.query(query, (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(results);
  });
});

app.post('/submit-grievance', (req, res) => {
  const { student_name, student_email, grievance_text } = req.body;
  const query = 'INSERT INTO grievances (student_name, student_email, grievance_text) VALUES (?, ?, ?)';
  grievanceDB.query(query, [student_name, student_email, grievance_text], (err) => {
    if (err) {
      console.error('Database insert error:', err);
      return res.status(500).send('Database insert error');
    }
    res.redirect('/grievance');
  });
});

app.post('/update-grievance-status', (req, res) => {
  const { id, status } = req.body;
  const query = 'UPDATE grievances SET status = ? WHERE id = ?';
  grievanceDB.query(query, [status, id], (err) => {
    if (err) return res.status(500).send('Database update error');
    res.sendStatus(200);
  });
});

// ------------------------ LEAVE ROUTES ------------------------ //
app.post('/submit-leave', (req, res) => {
  const { student_name, roll_no, reason, from_date, to_date } = req.body;
  const query = `
    INSERT INTO leave_requests (student_name, roll_no, reason, from_date, to_date, status)
    VALUES (?, ?, ?, ?, ?, 'pending')
  `;
  leaveDB.query(query, [student_name, roll_no, reason, from_date, to_date], (err) => {
    if (err) {
      console.error('Error submitting leave:', err);
      return res.status(500).json({ success: false, message: 'Failed to submit leave' });
    }
    res.json({ success: true, message: 'Leave submitted successfully' });
  });
});

app.get('/leave-requests', (req, res) => {
  const query = 'SELECT * FROM leave_requests ORDER BY submitted_at DESC';
  leaveDB.query(query, (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(results);
  });
});

app.get('/leave-pending', (req, res) => {
  const query = 'SELECT * FROM leave_requests WHERE status = "pending" ORDER BY submitted_at DESC';
  leaveDB.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching pending leaves:', err);
      return res.status(500).json({ success: false, message: 'Database error' });
    }
    res.json(results);
  });
});

app.get('/leave-status', (req, res) => {
  const query = 'SELECT * FROM leave_requests WHERE status = "accepted" ORDER BY submitted_at DESC';
  leaveDB.query(query, (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(results);
  });
});

app.get('/leave-rejected', (req, res) => {
  const query = 'SELECT * FROM leave_requests WHERE status = "rejected" ORDER BY submitted_at DESC';
  leaveDB.query(query, (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(results);
  });
});

app.get('/leave-logs', (req, res) => {
  const query = 'SELECT * FROM leave_requests ORDER BY id DESC';
  leaveDB.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching leave logs:', err);
      return res.status(500).json({ success: false, error: 'Database error' });
    }
    res.json(results);
  });
});

app.post('/update-leave-status', (req, res) => {
  const { id, status } = req.body;
  const query = 'UPDATE leave_requests SET status = ? WHERE id = ?';
  leaveDB.query(query, [status, id], (err) => {
    if (err) {
      console.error('Error updating leave status:', err);
      return res.status(500).json({ success: false });
    }
    res.json({ success: true });
  });
});

// ------------------------ TIMETABLE ROUTES ------------------------ //
app.post('/save-timetable', (req, res) => {
  const { branch, semester, timetable_json } = req.body;
  if (!branch || !semester || !timetable_json) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const selectQuery = 'SELECT timetable_json FROM timetables WHERE branch = ? LIMIT 1';
  timetableDB.query(selectQuery, [branch], (err, results) => {
    let existingData = {};
    if (!err && results.length > 0) {
      try {
        let jsonData = results[0].timetable_json;
        existingData = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
      } catch {
        existingData = {};
      }
    }
    const mergedData = { ...existingData, ...timetable_json };
    const upsertQuery = `
      INSERT INTO timetables (branch, semester, timetable_json)
      VALUES (?, 'all', ?)
      ON DUPLICATE KEY UPDATE 
        timetable_json = VALUES(timetable_json), 
        published_at = CURRENT_TIMESTAMP
    `;
    timetableDB.query(upsertQuery, [branch, JSON.stringify(mergedData)], (upsertErr) => {
      if (upsertErr) {
        console.error('Database error while saving:', upsertErr);
        return res.status(500).json({ error: 'Database error while saving' });
      }
      res.json({ success: true, message: 'Timetable published successfully' });
    });
  });
});

app.get('/get-timetable/:branch', (req, res) => {
  const { branch } = req.params;
  const query = 'SELECT timetable_json FROM timetables WHERE branch = ? LIMIT 1';
  timetableDB.query(query, [branch], (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (results.length === 0) return res.status(404).json({ error: 'No timetable found' });
    try {
      let timetableData = results[0].timetable_json;
      timetableData = typeof timetableData === 'string' ? JSON.parse(timetableData) : timetableData;
      res.json(timetableData);
    } catch {
      res.status(500).json({ error: 'Invalid timetable data' });
    }
  });
});

app.get('/get-timetable/:branch/:semester', (req, res) => {
  const { branch, semester } = req.params;
  const query = 'SELECT timetable_json FROM timetables WHERE branch = ? LIMIT 1';
  timetableDB.query(query, [branch], (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (results.length === 0) return res.status(404).json({ error: 'Timetable not found' });
    try {
      let allData = results[0].timetable_json;
      allData = typeof allData === 'string' ? JSON.parse(allData) : allData;
      res.json(allData[semester] ? { [semester]: allData[semester] } : {});
    } catch {
      res.status(500).json({ error: 'Invalid timetable data' });
    }
  });
});

// ------------------------ EXAMS ROUTES ------------------------ //

// Save exams (admin) - similar to timetable system
app.post('/save-exams', (req, res) => {
  const { branch, semester, exams_json } = req.body;
  
  console.log('Received exam data:', { branch, semester, exams_json });
  
  if (!branch || !semester || !exams_json) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Get existing exam data for this branch
  const selectQuery = 'SELECT exams_json FROM exam_schedules WHERE branch = ? LIMIT 1';
  examsDB.query(selectQuery, [branch], (err, results) => {
    let existingData = {};
    if (!err && results.length > 0) {
      try {
        let jsonData = results[0].exams_json;
        existingData = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
      } catch (parseErr) {
        console.error('Error parsing existing exam data:', parseErr);
        existingData = {};
      }
    }

    // Merge the new semester data with existing data
    const mergedData = { ...existingData, ...exams_json };
    
    // Insert or update the exam schedule
    const upsertQuery = `
      INSERT INTO exam_schedules (branch, semester, exams_json)
      VALUES (?, 'all', ?)
      ON DUPLICATE KEY UPDATE 
        exams_json = VALUES(exams_json), 
        published_at = CURRENT_TIMESTAMP
    `;
    
    examsDB.query(upsertQuery, [branch, JSON.stringify(mergedData)], (upsertErr) => {
      if (upsertErr) {
        console.error('Database error while saving exams:', upsertErr);
        return res.status(500).json({ error: 'Database error while saving' });
      }
      res.json({ success: true, message: 'Exam schedule published successfully' });
    });
  });
});

// Get exams for branch (all semesters)
app.get('/get-exams/:branch', (req, res) => {
  const { branch } = req.params;
  const query = 'SELECT exams_json FROM exam_schedules WHERE branch = ? LIMIT 1';
  examsDB.query(query, [branch], (err, results) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    if (results.length === 0) {
      return res.status(404).json({ error: 'No exam schedule found' });
    }
    try {
      let examData = results[0].exams_json;
      examData = typeof examData === 'string' ? JSON.parse(examData) : examData;
      res.json(examData);
    } catch (parseErr) {
      console.error('Error parsing exam data:', parseErr);
      res.status(500).json({ error: 'Invalid exam data' });
    }
  });
});

// Get exams for branch + specific semester
app.get('/get-exams/:branch/:semester', (req, res) => {
  const { branch, semester } = req.params;
  const query = 'SELECT exams_json FROM exam_schedules WHERE branch = ? LIMIT 1';
  examsDB.query(query, [branch], (err, results) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    if (results.length === 0) {
      return res.status(404).json({ error: 'Exam schedule not found' });
    }
    try {
      let allData = results[0].exams_json;
      allData = typeof allData === 'string' ? JSON.parse(allData) : allData;
      res.json(allData[semester] ? { [semester]: allData[semester] } : {});
    } catch (parseErr) {
      console.error('Error parsing exam data:', parseErr);
      res.status(500).json({ error: 'Invalid exam data' });
    }
  });
});

// ------------------------ START SERVER ------------------------ //
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running at http://0.0.0.0:${PORT}`);
});
