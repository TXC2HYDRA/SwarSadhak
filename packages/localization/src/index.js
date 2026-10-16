export const supportedLocales = ['en', 'mr', 'hi'];

export const localeNames = { en: 'English', mr: 'मराठी', hi: 'हिन्दी' };

export const requiredTranslationKeys = [
  'home', 'practice', 'library', 'progress', 'settings', 'greeting', 'subtitle',
  'start', 'continue', 'recommended', 'viewAll', 'minutes', 'streak', 'level',
  'studio', 'ready', 'libraryTitle', 'progressTitle', 'settingsTitle', 'today',
  'exercises.saSustain.name', 'exercises.saSustain.description', 'exercises.pitchMatch.name', 'exercises.pitchMatch.description', 'exercises.saPractice.name', 'exercises.saPractice.description', 'exercises.saReGaMa.name', 'exercises.saReGaMa.description',
  'warmup', 'warmupDesc', 'pitch', 'pitchDesc', 'view', 'recent', 'empty', 'language',
  'chooseExercise', 'chooseTonic', 'permissionTitle', 'permissionText', 'allowMic',
  'micReady', 'micDenied', 'micUnavailable', 'retry', 'startSession', 'pause', 'stop',
  'live', 'waiting', 'listening', 'paused', 'stopped', 'coaching'
];

export const practiceTranslations = {
  en: { names: ['Sa sustain', 'Pitch matching', 'Sa practice', 'Sa Re Ga Ma'], descriptions: ['Hold one comfortable note.', 'Match the target note.', 'Return gently to Sa.', 'Move through Sa, Re, Ga and Ma.'], instructions: 'Sing the displayed target and listen for a steady tone.', close: 'Good work — your pitch is close to the target.', flat: 'Your note is tending flat. Settle gently into the target.', sharp: 'Your note is tending sharp. Relax into the target.', silence: 'Sing a steady note so SwarSadhak can listen.', low_confidence: 'We could not assess this note confidently. Try a clearer, steadier tone.', clipping: 'The signal is too loud. Move slightly farther from the microphone.', target: 'Target', confidence: 'confidence', progress: 'Target {current} of {total}' },
  mr: { names: ['सा धरून ठेवा', 'सूर जुळवणे', 'सा सराव', 'सा रे ग म'], descriptions: ['एक आरामदायी सूर धरा.', 'लक्ष्य सूराशी जुळवा.', 'हळुवारपणे सा कडे परत या.', 'सा, रे, ग आणि म मधून जा.'], instructions: 'दाखवलेला लक्ष्य सूर गा आणि स्थिर आवाज ऐका.', close: 'छान! तुमचा सूर लक्ष्याजवळ आहे.', flat: 'तुमचा सूर किंचित खाली आहे. लक्ष्यावर हळुवार स्थिर व्हा.', sharp: 'तुमचा सूर किंचित वर आहे. आवाजावर ताण देऊ नका.', silence: 'SwarSadhak ऐकण्यासाठी स्थिर सूर गा.', low_confidence: 'या सुराचे नीट मूल्यमापन झाले नाही. अधिक स्थिर सूर गा.', clipping: 'आवाज खूप मोठा आहे. मायक्रोफोनपासून थोडे दूर जा.', target: 'लक्ष्य', confidence: 'विश्वास', progress: 'लक्ष्य {current} पैकी {total}' },
  hi: { names: ['सा बनाए रखें', 'सुर मिलाना', 'सा अभ्यास', 'सा रे ग म'], descriptions: ['एक सहज सुर पकड़ें।', 'लक्ष्य सुर से मिलाएं।', 'धीरे से सा पर लौटें।', 'सा, रे, ग और म से गुजरें।'], instructions: 'दिखाया गया लक्ष्य सुर गाएं और स्थिर आवाज़ सुनें।', close: 'बहुत अच्छा — आपका सुर लक्ष्य के पास है।', flat: 'आपका सुर थोड़ा नीचे है। लक्ष्य पर सहजता से टिकें।', sharp: 'आपका सुर थोड़ा ऊपर है। आवाज़ पर ज़ोर न दें।', silence: 'SwarSadhak को सुनाने के लिए स्थिर सुर गाएं।', low_confidence: 'इस सुर का भरोसे से आकलन नहीं हो सका। अधिक स्थिर सुर गाएं।', clipping: 'आवाज़ बहुत तेज़ है। माइक्रोफ़ोन से थोड़ा दूर जाएं।', target: 'लक्ष्य', confidence: 'विश्वास', progress: 'लक्ष्य {current} में से {total}' }
};

export function hasAllTranslations(locale) { return Boolean(practiceTranslations[locale]) && practiceTranslations[locale].names.length === 4; }
