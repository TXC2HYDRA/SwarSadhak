// Strings for attendance reports and batch reassignment. Kept out of the main bundle: only the (lazy) portals import it.
const strings = {
  en: {
    reports: {
      title: 'Attendance reports', lede: 'Built from the attendance teachers mark. Joining Google Meet is not attendance.', from: 'From', to: 'To', through: 'Counted up to {date}.',
      teachers: 'Teachers', batches: 'Batches', students: 'Students', teacher: 'Teacher', batch: 'Batch', student: 'Student', held: 'Classes held', cancelled: 'Cancelled', unmarked: 'Not marked',
      present: 'Present', late: 'Late', absent: 'Absent', excused: 'Excused', rate: 'Attendance', paused: 'Paused', none: 'No batches yet.', noMarks: 'No attendance marked in this range.', csv: 'Download CSV',
      rateNote: 'Attendance counts present or late out of classes marked present, late or absent; excused classes are left out. A paused batch shows its marks but not its classes.',
    },
    reassign: {
      action: 'Change teacher', title: 'Move {batch} to another teacher', lede: 'The batch keeps its students, schedule and attendance history. Each student\'s enrollment in {course} moves to the new teacher.',
      teacher: 'New teacher', submit: 'Move batch', cancel: 'Cancel', done: 'Batch moved to {teacher}. Enrollments moved: {count}.', meetWarning: 'The Meet link belongs to the previous teacher\'s Google account. Ask {teacher} to create or paste their own.',
      noOther: 'No other teacher is assigned to this course. Add one under Courses first.', notEnrolled: 'These students are not enrolled in this course: {names}.',
      elsewhere: 'These students are also in another of this teacher\'s batches for the course, so their enrollment cannot move: {names}.', conflict: 'The new teacher already has a batch at this time:',
    },
  },
  mr: {
    reports: {
      title: 'हजेरी अहवाल', lede: 'शिक्षकांनी नोंदवलेल्या हजेरीवरून. Google Meet मध्ये जॉइन होणे म्हणजे हजेरी नाही.', from: 'पासून', to: 'पर्यंत', through: '{date} पर्यंत मोजले.',
      teachers: 'शिक्षक', batches: 'बॅच', students: 'विद्यार्थी', teacher: 'शिक्षक', batch: 'बॅच', student: 'विद्यार्थी', held: 'झालेले वर्ग', cancelled: 'रद्द', unmarked: 'नोंद नाही',
      present: 'उपस्थित', late: 'उशिरा', absent: 'अनुपस्थित', excused: 'सवलत', rate: 'हजेरी', paused: 'थांबवलेली', none: 'अजून बॅच नाहीत.', noMarks: 'या कालावधीत हजेरी नोंदवलेली नाही.', csv: 'CSV डाउनलोड करा',
      rateNote: 'हजेरी म्हणजे उपस्थित, उशिरा किंवा अनुपस्थित नोंदवलेल्या वर्गांपैकी उपस्थित किंवा उशिरा; सवलत दिलेले वर्ग मोजले जात नाहीत. थांबवलेल्या बॅचची हजेरी दिसते, वर्ग नाहीत.',
    },
    reassign: {
      action: 'शिक्षक बदला', title: '{batch} दुसऱ्या शिक्षकांकडे द्या', lede: 'बॅचचे विद्यार्थी, वेळापत्रक आणि हजेरीचा इतिहास तसेच राहतात. प्रत्येक विद्यार्थ्याचा {course} मधील प्रवेश नव्या शिक्षकांकडे जातो.',
      teacher: 'नवे शिक्षक', submit: 'बॅच हलवा', cancel: 'रद्द करा', done: 'बॅच {teacher} यांच्याकडे दिली. हलवलेले प्रवेश: {count}.', meetWarning: 'Meet लिंक आधीच्या शिक्षकांच्या Google खात्याची आहे. {teacher} यांना स्वतःची लिंक तयार किंवा पेस्ट करायला सांगा.',
      noOther: 'या अभ्यासक्रमाला दुसरे शिक्षक नेमलेले नाहीत. आधी अभ्यासक्रम विभागात जोडा.', notEnrolled: 'हे विद्यार्थी या अभ्यासक्रमात प्रवेशित नाहीत: {names}.',
      elsewhere: 'हे विद्यार्थी याच अभ्यासक्रमाच्या या शिक्षकांच्या दुसऱ्या बॅचमध्येही आहेत, त्यामुळे प्रवेश हलवता येत नाही: {names}.', conflict: 'नव्या शिक्षकांची या वेळी आधीच बॅच आहे:',
    },
  },
  hi: {
    reports: {
      title: 'उपस्थिति रिपोर्ट', lede: 'शिक्षकों की दर्ज की गई उपस्थिति से। Google Meet में जुड़ना उपस्थिति नहीं है।', from: 'से', to: 'तक', through: '{date} तक गिना गया।',
      teachers: 'शिक्षक', batches: 'बैच', students: 'विद्यार्थी', teacher: 'शिक्षक', batch: 'बैच', student: 'विद्यार्थी', held: 'हुई कक्षाएँ', cancelled: 'रद्द', unmarked: 'दर्ज नहीं',
      present: 'उपस्थित', late: 'देर से', absent: 'अनुपस्थित', excused: 'छूट', rate: 'उपस्थिति', paused: 'रुका हुआ', none: 'अभी कोई बैच नहीं।', noMarks: 'इस अवधि में कोई उपस्थिति दर्ज नहीं।', csv: 'CSV डाउनलोड करें',
      rateNote: 'उपस्थिति = उपस्थित, देर से या अनुपस्थित दर्ज कक्षाओं में से उपस्थित या देर से; छूट वाली कक्षाएँ नहीं गिनी जातीं। रुके हुए बैच की उपस्थिति दिखती है, कक्षाएँ नहीं।',
    },
    reassign: {
      action: 'शिक्षक बदलें', title: '{batch} को दूसरे शिक्षक को सौंपें', lede: 'बैच के विद्यार्थी, समय-सारिणी और उपस्थिति का इतिहास वही रहता है। हर विद्यार्थी का {course} में नामांकन नए शिक्षक के पास जाता है।',
      teacher: 'नए शिक्षक', submit: 'बैच सौंपें', cancel: 'रद्द करें', done: 'बैच {teacher} को सौंपा गया। बदले गए नामांकन: {count}।', meetWarning: 'Meet लिंक पिछले शिक्षक के Google खाते का है। {teacher} से अपना लिंक बनाने या चिपकाने को कहें।',
      noOther: 'इस पाठ्यक्रम में कोई दूसरा शिक्षक नहीं है। पहले पाठ्यक्रम में जोड़ें।', notEnrolled: 'ये विद्यार्थी इस पाठ्यक्रम में नामांकित नहीं हैं: {names}।',
      elsewhere: 'ये विद्यार्थी इसी पाठ्यक्रम के इस शिक्षक के दूसरे बैच में भी हैं, इसलिए नामांकन नहीं बदल सकता: {names}।', conflict: 'नए शिक्षक का इस समय पहले से एक बैच है:',
    },
  },
};

export const reportStrings = (locale) => strings[locale] || strings.en;
export const reportLocales = Object.keys(strings);
