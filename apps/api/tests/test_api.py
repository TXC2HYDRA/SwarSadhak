import os, tempfile
from uuid import uuid4
os.environ["DATABASE_URL"]="sqlite:///"+tempfile.mktemp(suffix=".db")
from fastapi.testclient import TestClient
from app.main import app
client=TestClient(app)
def register(username,role):
    username = f"{username}-{uuid4().hex[:8]}"
    return client.post('/api/auth/register',json={'username':username,'password':'password123','display_name':username,'role':role}).json()
def test_health_and_auth():
    assert client.get('/api/health').json()['status']=='ok'; u=register('student','student'); assert client.get('/api/me',headers={'Authorization':'Bearer '+u['access_token']}).json()['role']=='student'
def test_invalid_and_raw_audio_rejected():
    u=register('student2','student'); h={'Authorization':'Bearer '+u['access_token']}; assert client.get('/api/practice-sessions',headers=h).status_code==200
    p={'id':'x','exercise_id':'unknown','tonic_frequency':261,'started_at':'2026-01-01T00:00:00Z','duration_seconds':1,'reliable_frame_count':1,'total_frame_count':1,'audio':'no'}
    assert client.post('/api/practice-sessions',json=p,headers=h).status_code==422
def valid_session(session_id='session-1'):
    return {'id':session_id,'exercise_id':'sa-sustain','tonic_frequency':261.63,'started_at':'2026-01-01T00:00:00Z','ended_at':'2026-01-01T00:00:10Z','duration_seconds':10,'reliable_frame_count':8,'total_frame_count':10,'reliable_pitch_match_percent':80,'median_absolute_cents':12,'pitch_stability_cents':9,'min_frequency_hz':250,'max_frequency_hz':270,'quality':{'reliableRatio':.8},'completion':{'completed':True}}
def test_practice_summary_create_read_idempotency_and_delete_isolation():
    first=register('owner','student'); second=register('other','student'); h={'Authorization':'Bearer '+first['access_token']}; ho={'Authorization':'Bearer '+second['access_token']}
    created=client.post('/api/practice-sessions',json=valid_session(),headers=h); assert created.status_code==201
    assert client.get('/api/practice-sessions',headers=h).json()[0]['id']=='session-1'
    assert client.post('/api/practice-sessions',json=valid_session(),headers=h).json()['duplicate'] is True
    assert client.post('/api/practice-sessions',json=valid_session(),headers=ho).status_code==409
    assert client.delete('/api/practice-sessions/session-1',headers=ho).status_code==404
    assert client.delete('/api/practice-sessions/session-1',headers=h).json()['deleted'] is True
def test_student_cannot_create_routine():
    u=register('student3','student'); h={'Authorization':'Bearer '+u['access_token']}; assert client.post('/api/routines',json={'id':'r','name':'x','routine':{'sections':[]}},headers=h).status_code==403
