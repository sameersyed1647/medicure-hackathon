const express = require('express');
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'medicare.db');
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(DB_FILE);

app.use(express.json({ limit: '1mb' }));
app.use('/assets', express.static(path.join(__dirname, 'public')));
app.use('/medicare', express.static(path.join(__dirname, 'apps', 'medicare')));
app.use('/partner', express.static(path.join(__dirname, 'apps', 'medicare-partner')));

const exec = (sql, params=[]) => db.prepare(sql).run(...params);
const all = (sql, params=[]) => db.prepare(sql).all(...params);
const get = (sql, params=[]) => db.prepare(sql).get(...params);
const json = v => JSON.stringify(v ?? []);
const parse = (v, fallback=[]) => { try { return v ? JSON.parse(v) : fallback; } catch { return fallback; } };
const id = prefix => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;

function initDb(){
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(`CREATE TABLE IF NOT EXISTS doctors (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, spec TEXT NOT NULL, keywords TEXT NOT NULL DEFAULT '[]',
    hospitalId TEXT, hospital TEXT, area TEXT, address TEXT, availableHours TEXT NOT NULL DEFAULT '[]', createdAt TEXT NOT NULL
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS hospitals (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, area TEXT NOT NULL, address TEXT NOT NULL, status TEXT NOT NULL,
    specialists TEXT NOT NULL DEFAULT '[]', distanceKm REAL NOT NULL DEFAULT 0, createdAt TEXT NOT NULL
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS patients (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, age INTEGER NOT NULL, gender TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '', blood TEXT,
    house TEXT, address TEXT, history TEXT, createdAt TEXT NOT NULL
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS appointments (
    id TEXT PRIMARY KEY, patientId TEXT NOT NULL, doctorId TEXT NOT NULL, hospitalId TEXT, date TEXT NOT NULL,
    hour TEXT NOT NULL, type TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Confirmed', createdAt TEXT NOT NULL,
    FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE,
    FOREIGN KEY(doctorId) REFERENCES doctors(id) ON DELETE CASCADE,
    FOREIGN KEY(hospitalId) REFERENCES hospitals(id) ON DELETE SET NULL
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS medicines (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, facility TEXT NOT NULL, area TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Available', quantity INTEGER NOT NULL DEFAULT 0, updatedAt TEXT NOT NULL
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS referrals (
    id TEXT PRIMARY KEY, patientId TEXT NOT NULL, fromFacility TEXT NOT NULL, toFacility TEXT NOT NULL,
    reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Referred', appointmentDate TEXT, createdAt TEXT NOT NULL,
    FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS followups (
    id TEXT PRIMARY KEY, patientId TEXT NOT NULL, condition TEXT NOT NULL, dueDate TEXT NOT NULL,
    assignedTo TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Due', createdAt TEXT NOT NULL,
    FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE
  )`);
}
// Backward-compatible migration for databases created by the previous build.
try {
  const cols = all('PRAGMA table_info(patients)');
  if (!cols.some(c => c.name === 'phone')) exec("ALTER TABLE patients ADD COLUMN phone TEXT NOT NULL DEFAULT ''");
} catch (e) { console.error('Patient phone migration:', e.message); }
const doctorOut = r => ({...r, keywords:parse(r.keywords), availableHours:parse(r.availableHours)});
const hospitalOut = r => ({...r, specialists:parse(r.specialists), distanceKm:Number(r.distanceKm||0)});

app.get('/api/health',(req,res)=>res.json({ok:true,service:'Medi Cure API'}));
app.get('/api/doctors',(req,res)=>{try{res.json(all('SELECT * FROM doctors ORDER BY name').map(doctorOut));}catch(e){res.status(500).json({error:e.message});}});
app.post('/api/doctors',(req,res)=>{try{
  const {name,spec,keywords=[],hospitalId=null,hospital='',area='',address='',availableHours=[]}=req.body;
  if(!name||!spec||!hospital||!availableHours.length)return res.status(400).json({error:'name, spec, hospital and at least one available hour are required'});
  let hid=hospitalId; if(!hid){const h=get('SELECT id FROM hospitals WHERE lower(name)=lower(?) LIMIT 1',[hospital]);hid=h?.id||null;}
  const d={id:id('doc'),name,spec,keywords,hospitalId:hid,hospital,area,address,availableHours};
  exec('INSERT INTO doctors VALUES (?,?,?,?,?,?,?,?,?,?)',[d.id,d.name,d.spec,json(d.keywords),d.hospitalId,d.hospital,d.area,d.address,json(d.availableHours),new Date().toISOString()]);res.status(201).json(d);
}catch(e){res.status(500).json({error:e.message});}});
app.put('/api/doctors/:id',(req,res)=>{try{
  const old=get('SELECT * FROM doctors WHERE id=?',[req.params.id]);if(!old)return res.status(404).json({error:'Doctor not found'});
  const d={...doctorOut(old),...req.body,id:req.params.id};if(!d.name||!d.spec||!d.hospital||!d.availableHours?.length)return res.status(400).json({error:'name, spec, hospital and at least one available hour are required'});
  exec('UPDATE doctors SET name=?,spec=?,keywords=?,hospitalId=?,hospital=?,area=?,address=?,availableHours=? WHERE id=?',[d.name,d.spec,json(d.keywords),d.hospitalId||null,d.hospital,d.area||'',d.address||'',json(d.availableHours),d.id]);res.json(d);
}catch(e){res.status(500).json({error:e.message});}});
app.delete('/api/doctors/:id',(req,res)=>{try{const r=exec('DELETE FROM doctors WHERE id=?',[req.params.id]);if(!r.changes)return res.status(404).json({error:'Doctor not found'});res.json({ok:true});}catch(e){res.status(500).json({error:e.message});}});

app.get('/api/hospitals',(req,res)=>{try{res.json(all('SELECT * FROM hospitals ORDER BY name').map(hospitalOut));}catch(e){res.status(500).json({error:e.message});}});
app.post('/api/hospitals',(req,res)=>{try{
  const {name,area,address,status='24/7 Emergency Available',specialists=[],distanceKm=0}=req.body;if(!name||!area||!address)return res.status(400).json({error:'name, area and address are required'});
  const h={id:id('hosp'),name,area,address,status,specialists,distanceKm:Number(distanceKm)||0};exec('INSERT INTO hospitals VALUES (?,?,?,?,?,?,?,?)',[h.id,h.name,h.area,h.address,h.status,json(h.specialists),h.distanceKm,new Date().toISOString()]);res.status(201).json(h);
}catch(e){res.status(500).json({error:e.message});}});
app.put('/api/hospitals/:id',(req,res)=>{try{
  const old=get('SELECT * FROM hospitals WHERE id=?',[req.params.id]);if(!old)return res.status(404).json({error:'Hospital not found'});const h={...hospitalOut(old),...req.body,id:req.params.id};if(!h.name||!h.area||!h.address)return res.status(400).json({error:'name, area and address are required'});
  exec('UPDATE hospitals SET name=?,area=?,address=?,status=?,specialists=?,distanceKm=? WHERE id=?',[h.name,h.area,h.address,h.status,json(h.specialists),Number(h.distanceKm)||0,h.id]);exec('UPDATE doctors SET hospital=?,area=?,address=? WHERE hospitalId=?',[h.name,h.area,h.address,h.id]);res.json(h);
}catch(e){res.status(500).json({error:e.message});}});
app.delete('/api/hospitals/:id',(req,res)=>{try{const r=exec('DELETE FROM hospitals WHERE id=?',[req.params.id]);if(!r.changes)return res.status(404).json({error:'Hospital not found'});exec('UPDATE doctors SET hospitalId=NULL WHERE hospitalId=?',[req.params.id]);res.json({ok:true});}catch(e){res.status(500).json({error:e.message});}});

app.get('/api/patients',(req,res)=>{try{res.json(all('SELECT id,name,age,gender,phone,blood,house,address,history,createdAt FROM patients ORDER BY createdAt DESC'));}catch(e){res.status(500).json({error:e.message});}});
app.post('/api/patients',(req,res)=>{try{
  const {name,age,gender,phone='',blood='Not Specified',house='N/A',address='General Location',history='None reported'}=req.body;if(!name||age===undefined||age===''||!gender||!/^\d{10}$/.test(String(phone)))return res.status(400).json({error:'Name, age, gender and a valid 10-digit phone number are required'});
  const p={id:id('p'),name,age:Number(age),gender,phone:String(phone),blood,house,address,history};exec('INSERT INTO patients (id,name,age,gender,phone,blood,house,address,history,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?)',[p.id,p.name,p.age,p.gender,p.phone,p.blood,p.house,p.address,p.history,new Date().toISOString()]);res.status(201).json(p);
}catch(e){res.status(500).json({error:e.message});}});

const appointmentSelect=`SELECT a.*,p.name patientName,p.age patientAge,p.gender patientGender,p.phone patientPhone,p.address patientAddress,
 d.name doctorName,d.spec doctorSpec,h.name hospitalName,h.area hospitalArea,h.address hospitalAddress
 FROM appointments a JOIN patients p ON p.id=a.patientId JOIN doctors d ON d.id=a.doctorId LEFT JOIN hospitals h ON h.id=a.hospitalId`;
app.get('/api/appointments',(req,res)=>{try{res.json(all(appointmentSelect+' ORDER BY a.date,a.hour,a.createdAt DESC'));}catch(e){res.status(500).json({error:e.message});}});
app.get('/api/appointments/patient/:patientId',(req,res)=>{try{res.json(all(`SELECT a.*,d.name doctorName,d.spec doctorSpec,h.name hospitalName,h.address hospitalAddress FROM appointments a JOIN doctors d ON d.id=a.doctorId LEFT JOIN hospitals h ON h.id=a.hospitalId WHERE a.patientId=? ORDER BY a.date,a.hour`,[req.params.patientId]));}catch(e){res.status(500).json({error:e.message});}});
app.post('/api/appointments',(req,res)=>{try{
  const {patientId,doctorId,date,hour,type='In-Person Clinic Visit'}=req.body;if(!patientId||!doctorId||!date||!hour)return res.status(400).json({error:'patientId, doctorId, date and hour are required'});
  const p=get('SELECT * FROM patients WHERE id=?',[patientId]),d=get('SELECT * FROM doctors WHERE id=?',[doctorId]);if(!p)return res.status(404).json({error:'Patient not found'});if(!d)return res.status(404).json({error:'Doctor not found'});
  const available=parse(d.availableHours);if(!available.includes(hour))return res.status(409).json({error:`${d.name} is unavailable at ${hour}`,availableHours:available});
  if(get(`SELECT id FROM appointments WHERE doctorId=? AND date=? AND hour=? AND status='Confirmed'`,[doctorId,date,hour]))return res.status(409).json({error:'That time slot is already booked for this doctor'});
  const a={id:id('apt'),patientId,doctorId,hospitalId:d.hospitalId,date,hour,type,status:'Confirmed'};exec('INSERT INTO appointments VALUES (?,?,?,?,?,?,?,?,?)',[a.id,a.patientId,a.doctorId,a.hospitalId,a.date,a.hour,a.type,a.status,new Date().toISOString()]);res.status(201).json(get(appointmentSelect+' WHERE a.id=?',[a.id]));
}catch(e){res.status(500).json({error:e.message});}});
app.patch('/api/appointments/:id/status',(req,res)=>{try{const allowed=['Confirmed','Completed','Cancelled'];if(!allowed.includes(req.body.status))return res.status(400).json({error:'Invalid status'});const r=exec('UPDATE appointments SET status=? WHERE id=?',[req.body.status,req.params.id]);if(!r.changes)return res.status(404).json({error:'Appointment not found'});res.json({ok:true,status:req.body.status});}catch(e){res.status(500).json({error:e.message});}});

// Care-support APIs: medicine visibility, referral tracking and high-risk follow-up.
app.get('/api/medicines',(req,res)=>{try{res.json(all('SELECT * FROM medicines ORDER BY name,facility'));}catch(e){res.status(500).json({error:e.message});}});
app.post('/api/medicines',(req,res)=>{try{const {name,facility,area,status='Available',quantity=0}=req.body;if(!name||!facility||!area)return res.status(400).json({error:'Medicine, facility and area are required'});const m={id:id('med'),name,facility,area,status,quantity:Number(quantity)||0,updatedAt:new Date().toISOString()};exec('INSERT INTO medicines VALUES (?,?,?,?,?,?,?)',[m.id,m.name,m.facility,m.area,m.status,m.quantity,m.updatedAt]);res.status(201).json(m);}catch(e){res.status(500).json({error:e.message});}});
app.put('/api/medicines/:id',(req,res)=>{try{const old=get('SELECT * FROM medicines WHERE id=?',[req.params.id]);if(!old)return res.status(404).json({error:'Medicine not found'});const m={...old,...req.body,id:req.params.id,quantity:Number(req.body.quantity ?? old.quantity)||0,updatedAt:new Date().toISOString()};exec('UPDATE medicines SET name=?,facility=?,area=?,status=?,quantity=?,updatedAt=? WHERE id=?',[m.name,m.facility,m.area,m.status,m.quantity,m.updatedAt,m.id]);res.json(m);}catch(e){res.status(500).json({error:e.message});}});
app.delete('/api/medicines/:id',(req,res)=>{try{const r=exec('DELETE FROM medicines WHERE id=?',[req.params.id]);if(!r.changes)return res.status(404).json({error:'Medicine not found'});res.json({ok:true});}catch(e){res.status(500).json({error:e.message});}});
app.get('/api/referrals',(req,res)=>{try{const q=`SELECT r.*,p.name patientName,p.phone patientPhone FROM referrals r JOIN patients p ON p.id=r.patientId ORDER BY r.createdAt DESC`;res.json(all(q));}catch(e){res.status(500).json({error:e.message});}});
app.get('/api/referrals/patient/:patientId',(req,res)=>{try{res.json(all('SELECT * FROM referrals WHERE patientId=? ORDER BY createdAt DESC',[req.params.patientId]));}catch(e){res.status(500).json({error:e.message});}});
app.post('/api/referrals',(req,res)=>{try{const {patientId,fromFacility,toFacility,reason,appointmentDate=null,status='Referred'}=req.body;if(!patientId||!fromFacility||!toFacility||!reason)return res.status(400).json({error:'Patient, from facility, destination and reason are required'});if(!get('SELECT id FROM patients WHERE id=?',[patientId]))return res.status(404).json({error:'Patient not found'});const r={id:id('ref'),patientId,fromFacility,toFacility,reason,status,appointmentDate,createdAt:new Date().toISOString()};exec('INSERT INTO referrals VALUES (?,?,?,?,?,?,?,?)',[r.id,r.patientId,r.fromFacility,r.toFacility,r.reason,r.status,r.appointmentDate,r.createdAt]);res.status(201).json(r);}catch(e){res.status(500).json({error:e.message});}});
app.patch('/api/referrals/:id/status',(req,res)=>{try{const allowed=['Referred','Appointment Pending','Consultation Completed','Cancelled'];if(!allowed.includes(req.body.status))return res.status(400).json({error:'Invalid referral status'});const r=exec('UPDATE referrals SET status=? WHERE id=?',[req.body.status,req.params.id]);if(!r.changes)return res.status(404).json({error:'Referral not found'});res.json({ok:true,status:req.body.status});}catch(e){res.status(500).json({error:e.message});}});
app.get('/api/followups',(req,res)=>{try{res.json(all(`SELECT f.*,p.name patientName,p.phone patientPhone FROM followups f JOIN patients p ON p.id=f.patientId ORDER BY f.dueDate ASC`));}catch(e){res.status(500).json({error:e.message});}});
app.get('/api/followups/patient/:patientId',(req,res)=>{try{res.json(all('SELECT * FROM followups WHERE patientId=? ORDER BY dueDate ASC',[req.params.patientId]));}catch(e){res.status(500).json({error:e.message});}});
app.post('/api/followups',(req,res)=>{try{const {patientId,condition,dueDate,assignedTo,status='Due'}=req.body;if(!patientId||!condition||!dueDate||!assignedTo)return res.status(400).json({error:'Patient, condition, due date and assigned worker are required'});if(!get('SELECT id FROM patients WHERE id=?',[patientId]))return res.status(404).json({error:'Patient not found'});const f={id:id('fu'),patientId,condition,dueDate,assignedTo,status,createdAt:new Date().toISOString()};exec('INSERT INTO followups VALUES (?,?,?,?,?,?,?)',[f.id,f.patientId,f.condition,f.dueDate,f.assignedTo,f.status,f.createdAt]);res.status(201).json(f);}catch(e){res.status(500).json({error:e.message});}});
app.patch('/api/followups/:id/status',(req,res)=>{try{const allowed=['Due','Completed','Overdue'];if(!allowed.includes(req.body.status))return res.status(400).json({error:'Invalid follow-up status'});const r=exec('UPDATE followups SET status=? WHERE id=?',[req.body.status,req.params.id]);if(!r.changes)return res.status(404).json({error:'Follow-up not found'});res.json({ok:true,status:req.body.status});}catch(e){res.status(500).json({error:e.message});}});

app.get('/',(req,res)=>res.redirect('/medicare/'));
app.get('/medicare',(req,res)=>res.redirect('/medicare/'));
app.get('/partner',(req,res)=>res.redirect('/partner/'));
app.get('/admin',(req,res)=>res.redirect('/partner/'));
initDb();
app.listen(PORT, '0.0.0.0', ()=>console.log(`Medi Cure + MediCure-partner running on port ${PORT}`));
