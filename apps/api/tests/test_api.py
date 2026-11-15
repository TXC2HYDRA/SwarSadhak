def valid_session(session_id='session-1'):
    return {'id':session_id,'exercise_id':'sa-sustain','tonic_frequency':261.63,'started_at':'2026-01-01T00:00:00Z','ended_at':'2026-01-01T00:00:10Z','duration_seconds':10,'reliable_frame_count':8,'total_frame_count':10,'reliable_pitch_match_percent':80,'median_absolute_cents':12,'pitch_stability_cents':9,'min_frequency_hz':250,'max_frequency_hz':270,'quality':{'reliableRatio':.8},'completion':{'completed':True}}

def routine(rid):
    return {'id':rid,'name':'Morning','routine':{'id':rid,'nameKey':'routines.custom.name','sections':[{'type':'warmup','items':[{'id':'w','exerciseId':'sa-sustain','durationSeconds':30}]},{'type':'main','items':[]},{'type':'cooldown','items':[]}]}}

def test_health_and_me(client, make_user):
    assert client.get('/api/health').json()['status']=='ok'
    _, h = make_user('student')
    assert client.get('/api/me',headers=h).json()['roles']==['student']

def test_invalid_and_raw_audio_rejected(client, make_user):
    _, h = make_user('student'); assert client.get('/api/practice-sessions',headers=h).status_code==200
    p={'id':'x','exercise_id':'unknown','tonic_frequency':261,'started_at':'2026-01-01T00:00:00Z','duration_seconds':1,'reliable_frame_count':1,'total_frame_count':1,'audio':'no'}
    assert client.post('/api/practice-sessions',json=p,headers=h).status_code==422

def test_practice_summary_create_read_idempotency_and_delete_isolation(client, make_user):
    _, h = make_user('student'); _, ho = make_user('student')
    created=client.post('/api/practice-sessions',json=valid_session(),headers=h); assert created.status_code==201
    assert client.get('/api/practice-sessions',headers=h).json()[0]['id']=='session-1'
    assert client.post('/api/practice-sessions',json=valid_session(),headers=h).json()['duplicate'] is True
    assert client.post('/api/practice-sessions',json=valid_session(),headers=ho).status_code==409
    assert client.delete('/api/practice-sessions/session-1',headers=ho).status_code==404
    assert client.delete('/api/practice-sessions/session-1',headers=h).json()['deleted'] is True

def test_student_and_owner_cannot_create_routine(client, make_user):
    for role in ('student', 'owner'):
        _, h = make_user(role); assert client.post('/api/routines',json=routine('r-denied'),headers=h).status_code==403

def test_routine_resync_updates_instead_of_failing(client, make_user):
    _, h = make_user('teacher'); _, other = make_user('teacher')
    assert client.post('/api/routines',json=routine('r-sync'),headers=h).status_code==201
    again = client.post('/api/routines',json={**routine('r-sync'),'name':'Evening'},headers=h)
    assert again.status_code==201 and again.json()['duplicate'] is True
    assert client.get('/api/routines/r-sync',headers=h).json()['name']=='Evening'
    assert client.post('/api/routines',json=routine('r-sync'),headers=other).status_code==409

def test_teacher_assigns_owned_routine_to_enrolled_student_only(client, make_user, academy):
    teacher, th = make_user('teacher'); student, sh = make_user('student'); other_teacher, _ = make_user('teacher'); stranger, _ = make_user('student')
    academy.enroll(student, academy.course('Vocal', teacher), teacher)
    assert client.post('/api/routines',json=routine('r-assign'),headers=th).status_code==201
    assert client.post('/api/assignments',json={'student_id':stranger['id'],'routine_id':'r-assign','title':'x'},headers=th).status_code==403
    created = client.post('/api/assignments',json={'student_id':student['id'],'routine_id':'r-assign','title':'Daily Sa'},headers=th)
    assert created.status_code==201
    assert client.post('/api/assignments',json={'student_id':other_teacher['id'],'routine_id':'r-assign','title':'x'},headers=th).status_code==403
    assert [a['title'] for a in client.get('/api/assignments',headers=sh).json()]==['Daily Sa']
    assert client.patch(f"/api/assignments/{created.json()['id']}",json={'status':'completed'},headers=sh).json()['status']=='completed'
