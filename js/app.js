/**
 * ============================================================================
 * SIMULASI CAT BKN - CASN (BADAN KEPEGAWAIAN NEGARA)
 * Core Application Engine & Scoring Logic
 * Conforms to PermenPAN-RB / KepmenPAN-RB SKD Standards
 * ============================================================================
 */

(function () {
  'use strict';

  // --- 1. CONFIGURATION & PERMENPAN-RB STANDARDS ---
  const CONFIG = {
    STORAGE_KEY: 'CAT_BKN_SIMULASI_STATE_V2',
    EXAM_DURATION_SECONDS: 100 * 60, // 100 minutes (6,000 seconds)
    PASSING_GRADES: {
      TWK: 65,  // Nilai Ambang Batas TWK (PermenPAN-RB)
      TIU: 80,  // Nilai Ambang Batas TIU (PermenPAN-RB)
      TKP: 166, // Nilai Ambang Batas TKP (PermenPAN-RB)
      TOTAL: 311
    },
    MAX_SCORES: {
      TWK: 150, // 30 soal x 5
      TIU: 175, // 35 soal x 5
      TKP: 225, // 45 soal x 5
      TOTAL: 550
    },
    COUNTS: {
      TWK: 30,
      TIU: 35,
      TKP: 45,
      TOTAL: 110
    }
  };

  // --- 2. GLOBAL APPLICATION STATE ---
  const state = {
    mode: 'simulasi',             // 'simulasi' | 'belajar' | 'review'
    currentIndex: 0,              // 0-indexed across normalized questions
    questions: [],                // Normalized questions list
    answers: {},                  // { [qId]: 'A' | 'B' | 'C' | 'D' | 'E' }
    ragu: {},                     // { [qId]: boolean }
    visited: {},                  // { [qId]: boolean }
    timeRemaining: CONFIG.EXAM_DURATION_SECONDS,
    timerInterval: null,
    isFinished: false,
    startTime: null,
    finishTime: null,
    categoryFilter: 'all',        // 'all' | 'TWK' | 'TIU' | 'TKP'
    gridRangeFilter: 'all',       // 'all' | 'TWK' | 'TIU' | 'TKP'
    reviewFilter: 'all',          // 'all' | 'wrong' | 'correct' | 'ragu' | 'TWK' | 'TIU' | 'TKP'
    studyRevealed: {},            // { [qId]: boolean } in study mode
    studyAnswers: {},             // { [qId]: 'A'|'B'|... } in study mode
    fontSize: 'font-md'           // 'font-sm' | 'font-md' | 'font-lg'
  };

  // --- 3. DOM ELEMENT CACHE ---
  const DOM = {
    // Header & Timer
    timerBox: document.getElementById('timer-box'),
    timerCountdown: document.getElementById('timer-countdown'),
    btnFinishExam: document.getElementById('btn-finish-exam'),
    candidateAvatar: document.getElementById('candidate-photo-avatar'),
    candidateName: document.getElementById('candidate-name'),
    candidateId: document.getElementById('candidate-id'),
    candidatePin: document.getElementById('candidate-pin'),

    // Mode Selector & Nav
    tabModeSimulasi: document.getElementById('tab-mode-simulasi'),
    tabModeBelajar: document.getElementById('tab-mode-belajar'),
    tabModeReview: document.getElementById('tab-mode-review'),
    categoryFilterBtns: document.querySelectorAll('[data-category-filter]'),
    countFilterAll: document.getElementById('count-filter-all'),
    countFilterTwk: document.getElementById('count-filter-twk'),
    countFilterTiu: document.getElementById('count-filter-tiu'),
    countFilterTkp: document.getElementById('count-filter-tkp'),
    btnFontDec: document.getElementById('btn-font-dec'),
    btnFontReset: document.getElementById('btn-font-reset'),
    btnFontInc: document.getElementById('btn-font-inc'),

    // Main Question Viewport
    questionViewport: document.getElementById('question-viewport'),
    bannerModeBelajar: document.getElementById('banner-mode-belajar'),
    questionCard: document.getElementById('question-card'),
    badgeQuestionNumber: document.getElementById('badge-question-number'),
    badgeQuestionCategory: document.getElementById('badge-question-category'),
    badgeCategoryText: document.getElementById('badge-category-text'),
    badgeQuestionWeight: document.getElementById('badge-question-weight'),
    questionStatusPill: document.getElementById('question-status-pill'),
    questionText: document.getElementById('question-text'),
    questionMedia: document.getElementById('question-media'),
    optionsContainer: document.getElementById('options-container'),

    // Action Controls
    btnPrev: document.getElementById('btn-prev'),
    btnRagu: document.getElementById('btn-ragu'),
    checkboxRagu: document.getElementById('checkbox-ragu'),
    btnToggleStudyPembahasan: document.getElementById('btn-toggle-study-pembahasan'),
    btnRetryQuestion: document.getElementById('btn-retry-question'),
    btnSkip: document.getElementById('btn-skip'),
    btnNext: document.getElementById('btn-next'),

    // Pembahasan Box
    pembahasanBox: document.getElementById('pembahasan-box'),
    kunciJawabanBadge: document.getElementById('kunci-jawaban-badge'),
    kunciJawabanText: document.getElementById('kunci-jawaban-text'),
    rationaleMainContent: document.getElementById('rationale-main-content'),
    optionBreakdownContainer: document.getElementById('option-breakdown-container'),
    breakdownOptA: document.getElementById('breakdown-opt-A'),
    breakdownOptB: document.getElementById('breakdown-opt-B'),
    breakdownOptC: document.getElementById('breakdown-opt-C'),
    breakdownOptD: document.getElementById('breakdown-opt-D'),
    breakdownOptE: document.getElementById('breakdown-opt-E'),
    tipsBox: document.getElementById('tips-box'),
    tipsText: document.getElementById('tips-text'),
    videoSection: document.getElementById('video-section'),
    videoTitleText: document.getElementById('video-title-text'),
    videoIframe: document.getElementById('video-iframe'),
    videoDirectLink: document.getElementById('video-direct-link'),
    sourceBox: document.getElementById('source-box'),
    sourceText: document.getElementById('source-text'),

    // Review Session View
    reviewSessionView: document.getElementById('review-session-view'),
    reviewFilterChips: document.querySelectorAll('[data-review-filter]'),
    reviewQuestionsList: document.getElementById('review-questions-list'),
    btnBackToExamFromReview: document.getElementById('btn-back-to-exam-from-review'),

    // Sidebar & Question Grid
    statAnswered: document.getElementById('stat-answered'),
    statRagu: document.getElementById('stat-ragu'),
    statUnanswered: document.getElementById('stat-unanswered'),
    statTotal: document.getElementById('stat-total'),
    progressBarFill: document.getElementById('progress-bar-fill'),
    gridSubfilterTabs: document.querySelectorAll('[data-grid-range]'),
    questionGrid: document.getElementById('question-grid'),
    legendCountAnswered: document.getElementById('legend-count-answered'),
    legendCountRagu: document.getElementById('legend-count-ragu'),
    legendCountUnanswered: document.getElementById('legend-count-unanswered'),

    // Modal: Confirmation
    modalConfirmFinish: document.getElementById('modal-confirm-finish'),
    confirmStatAnswered: document.getElementById('confirm-stat-answered'),
    confirmStatRagu: document.getElementById('confirm-stat-ragu'),
    confirmStatUnanswered: document.getElementById('confirm-stat-unanswered'),
    confirmUnansweredWarning: document.getElementById('confirm-unanswered-warning'),
    btnCancelFinish: document.getElementById('btn-cancel-finish'),
    btnSubmitExamFinal: document.getElementById('btn-submit-exam-final'),

    // Modal: Result Certificate
    modalResult: document.getElementById('modal-result'),
    certCandidateName: document.getElementById('cert-candidate-name'),
    certCandidateId: document.getElementById('cert-candidate-id'),
    certExamDate: document.getElementById('cert-exam-date'),
    certExamDuration: document.getElementById('cert-exam-duration'),
    scoreValTwk: document.getElementById('score-val-twk'),
    scoreValTiu: document.getElementById('score-val-tiu'),
    scoreValTkp: document.getElementById('score-val-tkp'),
    scoreValTotal: document.getElementById('score-val-total'),
    badgeStatusTwk: document.getElementById('badge-status-twk'),
    badgeStatusTiu: document.getElementById('badge-status-tiu'),
    badgeStatusTkp: document.getElementById('badge-status-tkp'),
    badgeStatusTotal: document.getElementById('badge-status-total'),
    finalStatusBanner: document.getElementById('final-status-banner'),
    finalStatusTitle: document.getElementById('final-status-title'),
    finalStatusDesc: document.getElementById('final-status-desc'),
    btnOpenReview: document.getElementById('btn-open-review'),
    btnPrintResult: document.getElementById('btn-print-result'),
    btnRestartExam: document.getElementById('btn-restart-exam')
  };

  // --- 4. UTILITIES & HELPERS ---

  /**
   * Safe HTML Escaping
   */
  function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Converts any YouTube watch/short link to a clean responsive embed URL
   */
  function toYouTubeEmbedUrl(url) {
    if (!url || typeof url !== 'string') return '';
    if (url.includes('/embed/')) return url;
    const match = url.match(/(?:watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
    if (match && match[1]) {
      return `https://www.youtube.com/embed/${match[1]}?enablejsapi=1&rel=0`;
    }
    return url;
  }

  /**
   * Converts an embed URL to a standard YouTube watch URL for direct viewing
   */
  function toYouTubeWatchUrl(url) {
    if (!url || typeof url !== 'string') return '#';
    const match = url.match(/(?:embed\/|watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (match && match[1]) {
      return `https://www.youtube.com/watch?v=${match[1]}`;
    }
    return url;
  }

  /**
   * Indonesian date formatter (e.g., "16 November 2024")
   */
  function formatIndonesianDate(d = new Date()) {
    const months = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  }

  /**
   * Formats seconds into MM:SS
   */
  function formatTime(seconds) {
    const safeSec = Math.max(0, Math.floor(seconds));
    const mins = Math.floor(safeSec / 60);
    const secs = safeSec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  /**
   * Standardizes raw question objects from window.SKD_QUESTIONS
   */
  function normalizeQuestion(raw, index) {
    const id = raw.id || raw.no || (index + 1);
    
    // Category detection: TWK (1-30), TIU (31-65), TKP (66-110)
    let kategori = (raw.kategori || raw.category || '').toUpperCase().trim();
    if (!kategori) {
      if (index < 30) kategori = 'TWK';
      else if (index < 65) kategori = 'TIU';
      else kategori = 'TKP';
    }

    const subkategori = raw.subkategori || raw.materi || raw.topik || 
      (kategori === 'TWK' ? 'Nasionalisme & Wawasan Kebangsaan' : 
       kategori === 'TIU' ? 'Kemampuan Numerik & Logika' : 'Karakteristik Pribadi & Profesionalisme');

    const soal = raw.soal || raw.pertanyaan || raw.question || '';
    const media = raw.media || raw.gambar || raw.svg || null;

    // Normalizing options { A, B, C, D, E }
    const rawOptions = raw.opsi || raw.pilihan || raw.options || {};
    const opsi = {};
    const optionKeys = ['A', 'B', 'C', 'D', 'E'];

    if (Array.isArray(rawOptions)) {
      rawOptions.forEach((opt, idx) => {
        if (idx < optionKeys.length) {
          const key = optionKeys[idx];
          opsi[key] = typeof opt === 'object' ? (opt.text || opt.label || '') : String(opt);
        }
      });
    } else {
      optionKeys.forEach(k => {
        opsi[k] = rawOptions[k] || rawOptions[k.toLowerCase()] || '';
      });
    }

    // Normalizing Key
    let kunci = String(raw.kunci || raw.kunci_jawaban || raw.jawaban_benar || raw.jawaban || 'A').toUpperCase().trim();
    if (kunci.length > 1) {
      kunci = kunci.charAt(0);
    }

    // Normalizing Weights (Bobot)
    let bobot = {};
    if (kategori === 'TKP') {
      const rawBobot = raw.bobot || raw.points || raw.skor_opsi || {};
      optionKeys.forEach((k, idx) => {
        let weight = rawBobot[k] ?? rawBobot[k.toLowerCase()];
        if (typeof weight !== 'number') {
          // If weights provided inside options array
          if (Array.isArray(rawOptions) && rawOptions[idx] && typeof rawOptions[idx].skor === 'number') {
            weight = rawOptions[idx].skor;
          } else {
            // Default descending weights if unspecified
            weight = 5 - idx;
          }
        }
        bobot[k] = Number(weight);
      });
      // For TKP, official key is the option that awards 5 points
      const bestOpt = optionKeys.find(k => bobot[k] === 5);
      if (bestOpt) kunci = bestOpt;
    } else {
      // TWK & TIU: 5 points for key, 0 for others
      optionKeys.forEach(k => {
        bobot[k] = (k === kunci) ? 5 : 0;
      });
    }

    // Normalizing Explanations
    const pembahasan = raw.pembahasan || raw.penjelasan || raw.explanation || 'Pembahasan materi resmi Seleksi Kompetensi Dasar BKN.';
    
    // Normalizing Option-by-Option Rationale
    const rawAnalisis = raw.analisis_opsi || raw.alasan_opsi || raw.pembahasan_opsi || {};
    const analisis_opsi = {};
    optionKeys.forEach(k => {
      analisis_opsi[k] = rawAnalisis[k] || rawAnalisis[k.toLowerCase()] || 
        (k === kunci ? `Opsi ${k} adalah jawaban paling tepat sesuai substansi materi.` : `Opsi ${k} kurang tepat atau tidak memenuhi kriteria pokok soal.`);
    });

    const tips = raw.tips || raw.trik || raw.rumus || 'Gunakan teknik eliminasi opsi yang tidak logis dan cermati kata kunci pada pokok soal.';
    const sumber = raw.sumber || raw.source || 'KepmenPAN-RB No. 321 / BKN RI';

    // Normalizing Video (TIU Math / Logic / Formulas)
    let video = null;
    const rawVideo = raw.video || raw.youtube || raw.youtube_url || raw.video_url || null;
    if (rawVideo) {
      if (typeof rawVideo === 'string') {
        video = {
          url: toYouTubeEmbedUrl(rawVideo),
          watchUrl: toYouTubeWatchUrl(rawVideo),
          title: `Video Pembahasan Soal No. ${id} - ${subkategori}`
        };
      } else if (typeof rawVideo === 'object') {
        const rawUrl = rawVideo.url || rawVideo.embedUrl || rawVideo.src || '';
        const channelName = rawVideo.channel ? ` (${rawVideo.channel})` : '';
        video = {
          url: toYouTubeEmbedUrl(rawUrl),
          watchUrl: toYouTubeWatchUrl(rawUrl),
          title: (rawVideo.title ? `${rawVideo.title}${channelName}` : `Video Pembahasan Soal No. ${id} - ${subkategori}`)
        };
      }
    }

    return {
      id,
      index,
      kategori,
      subkategori,
      soal,
      media,
      opsi,
      kunci,
      bobot,
      pembahasan,
      analisis_opsi,
      tips,
      sumber,
      video
    };
  }

  // --- 5. LOCAL STORAGE PERSISTENCE ---

  function saveState() {
    try {
      const payload = {
        answers: state.answers,
        ragu: state.ragu,
        visited: state.visited,
        timeRemaining: state.timeRemaining,
        currentIndex: state.currentIndex,
        isFinished: state.isFinished,
        mode: state.mode,
        fontSize: state.fontSize,
        studyAnswers: state.studyAnswers,
        studyRevealed: state.studyRevealed,
        startTime: state.startTime,
        finishTime: state.finishTime,
        savedAt: Date.now()
      };
      localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
      console.warn('Gagal menyimpan state ke localStorage:', e);
    }
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(CONFIG.STORAGE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (data && typeof data === 'object') {
        state.answers = data.answers || {};
        state.ragu = data.ragu || {};
        state.visited = data.visited || {};
        state.timeRemaining = typeof data.timeRemaining === 'number' ? data.timeRemaining : CONFIG.EXAM_DURATION_SECONDS;
        state.currentIndex = typeof data.currentIndex === 'number' ? data.currentIndex : 0;
        state.isFinished = !!data.isFinished;
        state.mode = data.mode || 'simulasi';
        state.fontSize = data.fontSize || 'font-md';
        state.studyAnswers = data.studyAnswers || {};
        state.studyRevealed = data.studyRevealed || {};
        state.startTime = data.startTime || Date.now();
        state.finishTime = data.finishTime || null;
        return true;
      }
    } catch (e) {
      console.warn('Gagal memuat state dari localStorage:', e);
    }
    return false;
  }

  function clearState() {
    try {
      localStorage.removeItem(CONFIG.STORAGE_KEY);
    } catch (e) {
      console.warn('Gagal menghapus state dari localStorage:', e);
    }
  }

  // --- 6. SCORING ENGINE (PERMENPAN-RB) ---

  function calculateScores() {
    let twkScore = 0;
    let tiuScore = 0;
    let tkpScore = 0;
    let twkCorrectCount = 0;
    let tiuCorrectCount = 0;
    let tkpMaxCount = 0;
    let answeredCount = 0;

    const detailedList = state.questions.map((q, idx) => {
      const userChoice = state.answers[q.id] || null;
      let scoreEarned = 0;
      let isCorrect = false;

      if (userChoice) answeredCount++;

      if (q.kategori === 'TWK') {
        if (userChoice && userChoice === q.kunci) {
          scoreEarned = 5;
          isCorrect = true;
          twkCorrectCount++;
        } else {
          scoreEarned = 0;
          isCorrect = false;
        }
        twkScore += scoreEarned;
      } else if (q.kategori === 'TIU') {
        if (userChoice && userChoice === q.kunci) {
          scoreEarned = 5;
          isCorrect = true;
          tiuCorrectCount++;
        } else {
          scoreEarned = 0;
          isCorrect = false;
        }
        tiuScore += scoreEarned;
      } else if (q.kategori === 'TKP') {
        if (userChoice && q.bobot && typeof q.bobot[userChoice] === 'number') {
          scoreEarned = q.bobot[userChoice];
        } else if (userChoice) {
          scoreEarned = (userChoice === q.kunci) ? 5 : 3;
        } else {
          scoreEarned = 0;
        }
        tkpScore += scoreEarned;
        if (scoreEarned === 5) {
          tkpMaxCount++;
          isCorrect = true;
        } else if (scoreEarned > 0) {
          isCorrect = (scoreEarned >= 4);
        }
      }

      return {
        question: q,
        index: idx,
        userChoice,
        scoreEarned,
        isCorrect,
        isRagu: !!state.ragu[q.id],
        isAnswered: !!userChoice
      };
    });

    const totalScore = twkScore + tiuScore + tkpScore;
    const passTWK = twkScore >= CONFIG.PASSING_GRADES.TWK;
    const passTIU = tiuScore >= CONFIG.PASSING_GRADES.TIU;
    const passTKP = tkpScore >= CONFIG.PASSING_GRADES.TKP;
    const passTotal = passTWK && passTIU && passTKP;

    return {
      twkScore,
      tiuScore,
      tkpScore,
      totalScore,
      passTWK,
      passTIU,
      passTKP,
      passTotal,
      twkCorrectCount,
      tiuCorrectCount,
      tkpMaxCount,
      answeredCount,
      detailedList
    };
  }

  // --- 7. TIMER CONTROLLER ---

  function startTimer() {
    if (state.timerInterval) clearInterval(state.timerInterval);

    // Initial display
    updateTimerDisplay();

    state.timerInterval = setInterval(() => {
      if (state.mode !== 'simulasi' || state.isFinished) {
        return;
      }

      state.timeRemaining -= 1;

      if (state.timeRemaining <= 0) {
        state.timeRemaining = 0;
        updateTimerDisplay();
        clearInterval(state.timerInterval);
        state.timerInterval = null;
        alert('WAKTU UJIAN HABIS! Sistem otomatis menyimpan dan menilai lembar jawaban Anda.');
        finishExam(true);
        return;
      }

      updateTimerDisplay();

      // Save state every 10 seconds
      if (state.timeRemaining % 10 === 0) {
        saveState();
      }
    }, 1000);
  }

  function updateTimerDisplay() {
    if (!DOM.timerCountdown) return;

    if (state.mode === 'belajar') {
      DOM.timerCountdown.textContent = 'BELAJAR';
      if (DOM.timerBox) {
        DOM.timerBox.classList.remove('warning', 'danger');
      }
      return;
    }

    if (state.mode === 'review' || state.isFinished) {
      DOM.timerCountdown.textContent = 'SELESAI';
      if (DOM.timerBox) {
        DOM.timerBox.classList.remove('warning', 'danger');
      }
      return;
    }

    DOM.timerCountdown.textContent = formatTime(state.timeRemaining);

    if (DOM.timerBox) {
      if (state.timeRemaining <= 60) {
        DOM.timerBox.classList.add('danger');
        DOM.timerBox.classList.remove('warning');
      } else if (state.timeRemaining <= 600) {
        DOM.timerBox.classList.add('warning');
        DOM.timerBox.classList.remove('danger');
      } else {
        DOM.timerBox.classList.remove('warning', 'danger');
      }
    }
  }

  function pauseTimer() {
    if (state.timerInterval) {
      clearInterval(state.timerInterval);
      state.timerInterval = null;
    }
  }

  // --- 8. QUESTION VIEWPORT RENDERING ---

  function renderCurrentQuestion() {
    if (!state.questions || state.questions.length === 0) return;

    // Boundary check
    if (state.currentIndex < 0) state.currentIndex = 0;
    if (state.currentIndex >= state.questions.length) {
      state.currentIndex = state.questions.length - 1;
    }

    const q = state.questions[state.currentIndex];
    state.visited[q.id] = true;

    // Header Badges
    if (DOM.badgeQuestionNumber) {
      DOM.badgeQuestionNumber.textContent = `Soal No. ${q.id}`;
    }

    if (DOM.badgeCategoryText) {
      DOM.badgeCategoryText.textContent = `${q.kategori} - ${q.subkategori}`;
    }

    if (DOM.badgeQuestionWeight) {
      if (q.kategori === 'TWK') {
        DOM.badgeQuestionWeight.textContent = 'Bobot: Benar +5, Salah 0 (Ambang Batas: 65)';
      } else if (q.kategori === 'TIU') {
        DOM.badgeQuestionWeight.textContent = 'Bobot: Benar +5, Salah 0 (Ambang Batas: 80)';
      } else {
        DOM.badgeQuestionWeight.textContent = 'Bobot: Nilai 1 s.d. 5, Kosong 0 (Ambang Batas: 166)';
      }
    }

    // Status Pill
    const isAnswered = !!state.answers[q.id];
    const isRagu = !!state.ragu[q.id];

    if (DOM.questionStatusPill) {
      DOM.questionStatusPill.className = 'question-status-pill';
      if (isRagu) {
        DOM.questionStatusPill.classList.add('ragu');
        DOM.questionStatusPill.textContent = 'Ragu-Ragu';
      } else if (isAnswered) {
        DOM.questionStatusPill.classList.add('answered');
        DOM.questionStatusPill.textContent = 'Sudah Dijawab';
      } else {
        DOM.questionStatusPill.classList.add('unanswered');
        DOM.questionStatusPill.textContent = 'Belum Dijawab';
      }
    }

    // Question Text
    if (DOM.questionText) {
      DOM.questionText.innerHTML = q.soal;
    }

    // Question Media / Figural
    if (DOM.questionMedia) {
      if (q.media) {
        DOM.questionMedia.innerHTML = q.media;
        DOM.questionMedia.style.display = 'block';
      } else {
        DOM.questionMedia.innerHTML = '';
        DOM.questionMedia.style.display = 'none';
      }
    }

    // Render Options A - E
    renderOptions(q);

    // Ragu-Ragu Checkbox
    if (DOM.checkboxRagu) {
      DOM.checkboxRagu.checked = isRagu;
    }
    if (DOM.btnRagu) {
      if (isRagu) {
        DOM.btnRagu.classList.add('active');
      } else {
        DOM.btnRagu.classList.remove('active');
      }
    }

    // Navigation buttons state
    if (DOM.btnPrev) {
      DOM.btnPrev.disabled = (state.currentIndex === 0);
    }
    if (DOM.btnNext) {
      if (state.currentIndex === state.questions.length - 1) {
        DOM.btnNext.querySelector('span').textContent = 'Simpan Jawaban';
      } else {
        DOM.btnNext.querySelector('span').textContent = 'Simpan & Lanjutkan';
      }
    }

    // Mode-specific Controls and Pembahasan Handling
    if (state.mode === 'belajar') {
      if (DOM.btnToggleStudyPembahasan) DOM.btnToggleStudyPembahasan.style.display = 'inline-flex';
      if (DOM.btnRetryQuestion) DOM.btnRetryQuestion.style.display = 'inline-flex';

      const studyAnswer = state.studyAnswers[q.id] || state.answers[q.id];
      const isRevealed = state.studyRevealed[q.id] || !!studyAnswer;

      if (isRevealed && DOM.pembahasanBox) {
        renderPembahasan(q, studyAnswer);
        DOM.pembahasanBox.classList.add('visible');
        if (DOM.btnToggleStudyPembahasan) {
          DOM.btnToggleStudyPembahasan.querySelector('span').textContent = 'Tutup Pembahasan';
        }
      } else {
        if (DOM.pembahasanBox) DOM.pembahasanBox.classList.remove('visible');
        if (DOM.btnToggleStudyPembahasan) {
          DOM.btnToggleStudyPembahasan.querySelector('span').textContent = 'Buka Pembahasan';
        }
      }
    } else if (state.mode === 'review') {
      if (DOM.btnToggleStudyPembahasan) DOM.btnToggleStudyPembahasan.style.display = 'none';
      if (DOM.btnRetryQuestion) DOM.btnRetryQuestion.style.display = 'none';
      if (DOM.pembahasanBox) {
        renderPembahasan(q, state.answers[q.id]);
        DOM.pembahasanBox.classList.add('visible');
      }
    } else {
      // Mode Simulasi: Pembahasan is completely hidden
      if (DOM.btnToggleStudyPembahasan) DOM.btnToggleStudyPembahasan.style.display = 'none';
      if (DOM.btnRetryQuestion) DOM.btnRetryQuestion.style.display = 'none';
      if (DOM.pembahasanBox) {
        DOM.pembahasanBox.classList.remove('visible');
        // Stop any playing video
        if (DOM.videoIframe) DOM.videoIframe.src = '';
      }
    }

    // Update Sidebar Navigation Grid
    renderSidebar();
    saveState();
  }

  /**
   * Renders Option cards (A - E) for the current question
   */
  function renderOptions(q) {
    if (!DOM.optionsContainer) return;
    DOM.optionsContainer.innerHTML = '';

    const optionKeys = ['A', 'B', 'C', 'D', 'E'];
    const currentAnswer = (state.mode === 'belajar') 
      ? (state.studyAnswers[q.id] || state.answers[q.id]) 
      : state.answers[q.id];

    const isStudyFeedbackActive = (state.mode === 'belajar' && (state.studyRevealed[q.id] || !!currentAnswer));
    const isReviewMode = (state.mode === 'review');

    optionKeys.forEach(key => {
      const optionText = q.opsi[key] || '';
      const isSelected = (currentAnswer === key);
      const isKey = (key === q.kunci);
      const weight = (q.bobot && typeof q.bobot[key] === 'number') ? q.bobot[key] : (isKey ? 5 : 0);

      const label = document.createElement('label');
      label.className = 'option-card';
      label.setAttribute('data-option', key);

      // Classes for Mode Belajar & Review
      if (isStudyFeedbackActive || isReviewMode) {
        label.classList.add('show-feedback');
        if (isKey) {
          label.classList.add('is-correct-key');
        }
        if (isSelected && !isKey && q.kategori !== 'TKP') {
          label.classList.add('is-wrong-selection');
        }
        if (isSelected && q.kategori === 'TKP' && weight < 5) {
          label.classList.add('is-suboptimal');
        }
      }

      if (isSelected) {
        label.classList.add('selected');
      }

      // Input Radio
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = `skd_answer_${q.id}`;
      radio.value = key;
      radio.checked = isSelected;

      // In Review mode, options are read-only
      if (isReviewMode) {
        radio.disabled = true;
      }

      // Indicator badge (A, B, C, D, E)
      const indicator = document.createElement('span');
      indicator.className = 'option-indicator';
      indicator.textContent = key;

      // Option text
      const textDiv = document.createElement('div');
      textDiv.className = 'option-text';
      textDiv.innerHTML = optionText;

      // Option score pill
      const scorePill = document.createElement('span');
      scorePill.className = 'option-score-pill';
      if (q.kategori === 'TKP') {
        scorePill.textContent = `+${weight}`;
      } else {
        scorePill.textContent = (weight === 5) ? '+5' : '0';
      }

      label.appendChild(radio);
      label.appendChild(indicator);
      label.appendChild(textDiv);
      label.appendChild(scorePill);

      // Event Listener: Option Click
      label.addEventListener('click', (e) => {
        if (isReviewMode) return;
        selectOption(q, key);
      });

      DOM.optionsContainer.appendChild(label);
    });
  }

  /**
   * Handles user selecting an option
   */
  function selectOption(q, chosenKey) {
    if (state.mode === 'simulasi') {
      state.answers[q.id] = chosenKey;
      renderCurrentQuestion();
    } else if (state.mode === 'belajar') {
      state.studyAnswers[q.id] = chosenKey;
      state.answers[q.id] = chosenKey;
      state.studyRevealed[q.id] = true;
      renderCurrentQuestion();
    }
  }

  /**
   * Renders Exhaustive Pembahasan Box
   */
  function renderPembahasan(q, userChoice) {
    if (!DOM.pembahasanBox) return;

    // Official Key & Rationale Badge
    if (DOM.kunciJawabanText) {
      if (q.kategori === 'TKP') {
        const bestOpt = ['A', 'B', 'C', 'D', 'E'].find(k => q.bobot[k] === 5) || q.kunci;
        DOM.kunciJawabanText.textContent = `${bestOpt} (Skor Tertinggi 5)`;
      } else {
        DOM.kunciJawabanText.textContent = q.kunci;
      }
    }

    // Main Rationale
    if (DOM.rationaleMainContent) {
      DOM.rationaleMainContent.innerHTML = q.pembahasan;
    }

    // Option-by-Option Breakdown (A - E)
    const optionKeys = ['A', 'B', 'C', 'D', 'E'];
    optionKeys.forEach(k => {
      const breakdownEl = document.getElementById(`breakdown-opt-${k}`);
      if (!breakdownEl) return;

      const isKey = (k === q.kunci);
      const weight = (q.bobot && typeof q.bobot[k] === 'number') ? q.bobot[k] : (isKey ? 5 : 0);
      const analysisText = (q.analisis_opsi && q.analisis_opsi[k]) ? q.analisis_opsi[k] : '';

      let badgeHtml = '';
      if (q.kategori === 'TKP') {
        badgeHtml = `<span style="display:inline-block; font-size:0.75rem; font-weight:800; padding:2px 8px; border-radius:10px; margin-right:6px; background:${weight === 5 ? '#d1fae5; color:#065f46;' : '#f1f5f9; color:#475569;'}">Skor ${weight}</span>`;
      } else {
        badgeHtml = `<span style="display:inline-block; font-size:0.75rem; font-weight:800; padding:2px 8px; border-radius:10px; margin-right:6px; background:${isKey ? '#d1fae5; color:#065f46;' : '#fee2e2; color:#991b1b;'}">${isKey ? 'Kunci Benar (+5)' : 'Salah (0)'}</span>`;
      }

      breakdownEl.innerHTML = `
        <span class="option-breakdown-letter ${isKey ? 'key' : ''}">${k}</span>
        <div class="option-breakdown-desc">
          <strong>Opsi ${k}:</strong> ${badgeHtml} ${escapeHTML(analysisText)}
        </div>
      `;
    });

    // Tips & Trik Box
    if (DOM.tipsText) {
      DOM.tipsText.innerHTML = q.tips || 'Perhatikan kata kunci pada pokok soal dan eliminasi opsi yang bertentangan.';
    }

    // Playable YouTube Video Embed (TIU Numerik/Logika/Figural)
    if (DOM.videoSection && DOM.videoIframe) {
      if (q.video && q.video.url) {
        DOM.videoSection.style.display = 'block';
        if (DOM.videoIframe.src !== q.video.url) {
          DOM.videoIframe.src = q.video.url;
        }
        if (DOM.videoTitleText) {
          DOM.videoTitleText.textContent = q.video.title || `Video Pembahasan Soal No. ${q.id}`;
        }
        if (DOM.videoDirectLink) {
          DOM.videoDirectLink.href = q.video.watchUrl || q.video.url;
        }
      } else {
        DOM.videoSection.style.display = 'none';
        DOM.videoIframe.src = '';
      }
    }

    // Official Source
    if (DOM.sourceText) {
      DOM.sourceText.textContent = q.sumber || 'KepmenPAN-RB / FR Resmi CAT BKN';
    }
  }

  // --- 9. SIDEBAR & QUESTION GRID CONTROLLER ---

  function renderSidebar() {
    if (!state.questions || state.questions.length === 0) return;

    let answeredCount = 0;
    let raguCount = 0;
    let unansweredCount = 0;

    state.questions.forEach(q => {
      const hasAnswer = !!state.answers[q.id];
      const hasRagu = !!state.ragu[q.id];

      if (hasRagu) {
        raguCount++;
      } else if (hasAnswer) {
        answeredCount++;
      } else {
        unansweredCount++;
      }
    });

    const totalQuestions = state.questions.length;

    // Header counters
    if (DOM.statAnswered) DOM.statAnswered.textContent = answeredCount;
    if (DOM.statRagu) DOM.statRagu.textContent = raguCount;
    if (DOM.statUnanswered) DOM.statUnanswered.textContent = unansweredCount;
    if (DOM.statTotal) DOM.statTotal.textContent = totalQuestions;

    // Progress bar fill percentage
    if (DOM.progressBarFill) {
      const pct = Math.round(((answeredCount + raguCount) / totalQuestions) * 100);
      DOM.progressBarFill.style.width = `${pct}%`;
    }

    // Legend counters
    if (DOM.legendCountAnswered) DOM.legendCountAnswered.textContent = `(${answeredCount})`;
    if (DOM.legendCountRagu) DOM.legendCountRagu.textContent = `(${raguCount})`;
    if (DOM.legendCountUnanswered) DOM.legendCountUnanswered.textContent = `(${unansweredCount})`;

    // Filter Badges Count
    if (DOM.countFilterAll) DOM.countFilterAll.textContent = totalQuestions;
    if (DOM.countFilterTwk) DOM.countFilterTwk.textContent = CONFIG.COUNTS.TWK;
    if (DOM.countFilterTiu) DOM.countFilterTiu.textContent = CONFIG.COUNTS.TIU;
    if (DOM.countFilterTkp) DOM.countFilterTkp.textContent = CONFIG.COUNTS.TKP;

    // Render Grid Buttons
    renderGridButtons();
  }

  function renderGridButtons() {
    if (!DOM.questionGrid) return;
    DOM.questionGrid.innerHTML = '';

    state.questions.forEach((q, idx) => {
      // Range Filter check
      if (state.gridRangeFilter !== 'all' && q.kategori !== state.gridRangeFilter) {
        return;
      }

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'grid-btn';
      btn.textContent = q.id;
      btn.setAttribute('data-index', idx);
      btn.setAttribute('aria-label', `Soal No. ${q.id} - ${q.kategori}`);

      const hasAnswer = !!state.answers[q.id];
      const hasRagu = !!state.ragu[q.id];
      const isCurrent = (idx === state.currentIndex);

      if (hasRagu) {
        btn.classList.add('ragu');
      } else if (hasAnswer) {
        btn.classList.add('answered');
      } else {
        btn.classList.add('unanswered');
      }

      if (isCurrent) {
        btn.classList.add('current');
      }

      btn.addEventListener('click', () => {
        state.currentIndex = idx;
        if (state.mode === 'review' && DOM.reviewSessionView && DOM.reviewSessionView.classList.contains('active')) {
          DOM.reviewSessionView.classList.remove('active');
          DOM.questionCard.style.display = 'block';
        }
        renderCurrentQuestion();
      });

      DOM.questionGrid.appendChild(btn);
    });
  }

  // --- 10. POST-EXAM REVIEW SESI VIEW ---

  function renderReviewSessionView() {
    if (!DOM.reviewQuestionsList) return;
    DOM.reviewQuestionsList.innerHTML = '';

    const results = calculateScores();

    // Calculate dynamic counts for review chips
    const wrongCount = results.detailedList.filter(item => !item.isCorrect).length;
    const correctCount = results.detailedList.filter(item => item.isCorrect).length;
    const raguCount = results.detailedList.filter(item => item.isRagu).length;
    const twkCount = results.detailedList.filter(item => item.question.kategori === 'TWK').length;
    const tiuCount = results.detailedList.filter(item => item.question.kategori === 'TIU').length;
    const tkpCount = results.detailedList.filter(item => item.question.kategori === 'TKP').length;

    // Update filter chip labels
    if (DOM.reviewFilterChips) {
      DOM.reviewFilterChips.forEach(chip => {
        const filterKey = chip.getAttribute('data-review-filter');
        if (filterKey === 'all') chip.textContent = `Semua Soal (${results.detailedList.length})`;
        else if (filterKey === 'wrong') chip.textContent = `Salah / Suboptimal (${wrongCount})`;
        else if (filterKey === 'correct') chip.textContent = `Benar / Skor Maks (${correctCount})`;
        else if (filterKey === 'ragu') chip.textContent = `Ragu-Ragu (${raguCount})`;
        else if (filterKey === 'TWK') chip.textContent = `TWK (${twkCount})`;
        else if (filterKey === 'TIU') chip.textContent = `TIU (${tiuCount})`;
        else if (filterKey === 'TKP') chip.textContent = `TKP (${tkpCount})`;
      });
    }

    // Filter questions according to state.reviewFilter
    const filtered = results.detailedList.filter(item => {
      const q = item.question;
      switch (state.reviewFilter) {
        case 'wrong':
          return !item.isCorrect;
        case 'correct':
          return item.isCorrect;
        case 'ragu':
          return item.isRagu;
        case 'TWK':
          return q.kategori === 'TWK';
        case 'TIU':
          return q.kategori === 'TIU';
        case 'TKP':
          return q.kategori === 'TKP';
        case 'all':
        default:
          return true;
      }
    });

    if (filtered.length === 0) {
      DOM.reviewQuestionsList.innerHTML = `
        <div style="text-align:center; padding:3rem 1rem; color:var(--text-muted); background:#ffffff; border-radius:var(--radius-md); border:1px solid var(--border-color);">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom:0.75rem; opacity:0.6;">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <h4 style="margin:0 0 0.25rem 0; font-size:1.05rem;">Tidak ada soal dalam filter ini</h4>
          <p style="margin:0; font-size:0.875rem;">Silakan pilih filter lain di atas untuk melihat soal lainnya.</p>
        </div>
      `;
      return;
    }

    filtered.forEach(item => {
      const q = item.question;
      const userChoice = item.userChoice;
      const isCorrect = item.isCorrect;

      const card = document.createElement('article');
      card.className = 'review-card';

      if (item.isRagu) {
        card.classList.add('status-ragu');
      } else if (!userChoice) {
        card.classList.add('status-unanswered');
      } else if (isCorrect) {
        card.classList.add('status-correct');
      } else {
        card.classList.add('status-wrong');
      }

      // Result Badge Text
      let resultBadgeHtml = '';
      if (!userChoice) {
        resultBadgeHtml = `<span class="review-user-result-badge unanswered">Belum Dijawab (0 Poin)</span>`;
      } else if (q.kategori === 'TKP') {
        resultBadgeHtml = `<span class="review-user-result-badge ${item.scoreEarned === 5 ? 'correct' : 'wrong'}">Pilihan Anda: Opsi ${userChoice} (Skor: ${item.scoreEarned})</span>`;
      } else if (isCorrect) {
        resultBadgeHtml = `<span class="review-user-result-badge correct">Benar: Opsi ${userChoice} (+5 Poin)</span>`;
      } else {
        resultBadgeHtml = `<span class="review-user-result-badge wrong">Salah: Opsi ${userChoice} (Kunci: ${q.kunci}) (0 Poin)</span>`;
      }

      // Options List
      const optionKeys = ['A', 'B', 'C', 'D', 'E'];
      let optionsHtml = '';

      optionKeys.forEach(k => {
        const isKey = (k === q.kunci);
        const isUserPick = (userChoice === k);
        const weight = (q.bobot && typeof q.bobot[k] === 'number') ? q.bobot[k] : (isKey ? 5 : 0);

        let rowClass = 'review-option-row';
        if (isKey) rowClass += ' is-key';
        if (isUserPick && !isKey && q.kategori !== 'TKP') rowClass += ' user-wrong';

        let pillText = (q.kategori === 'TKP') ? `+${weight}` : (isKey ? '+5' : '0');

        optionsHtml += `
          <div class="${rowClass}">
            <span class="review-option-letter">${k}</span>
            <div class="review-option-text">${escapeHTML(q.opsi[k])}</div>
            <span style="font-size:0.75rem; font-weight:800; padding:2px 8px; border-radius:8px; background:${isKey ? '#d1fae5; color:#065f46;' : '#f1f5f9; color:#64748b;'}">${pillText}</span>
          </div>
        `;
      });

      // Video Section HTML if available
      let videoHtml = '';
      if (q.video && q.video.url) {
        videoHtml = `
          <div class="video-explainer-card" style="margin-top:0.75rem;">
            <div class="video-header">
              <span class="video-badge">YOUTUBE PEMBAHASAN</span>
              <span class="video-title">${escapeHTML(q.video.title)}</span>
            </div>
            <div class="video-embed-container">
              <iframe src="${escapeHTML(q.video.url)}" title="${escapeHTML(q.video.title)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe>
            </div>
            <a href="${escapeHTML(q.video.watchUrl)}" target="_blank" rel="noopener noreferrer" class="video-fallback-link">Tonton langsung di YouTube &rarr;</a>
          </div>
        `;
      }

      // Option by option breakdown HTML
      let breakdownHtml = '';
      optionKeys.forEach(k => {
        const isKey = (k === q.kunci);
        const optWeight = (q.bobot && typeof q.bobot[k] === 'number') ? q.bobot[k] : (isKey ? 5 : 0);
        const optText = (q.analisis_opsi && q.analisis_opsi[k]) ? q.analisis_opsi[k] : '';
        breakdownHtml += `
          <div style="font-size:0.875rem; line-height:1.5; margin-bottom:0.4rem; padding-left:0.5rem; border-left:3px solid ${isKey ? 'var(--success)' : 'var(--border-color)'};">
            <strong>Opsi ${k} (${q.kategori === 'TKP' ? 'Skor ' + optWeight : (isKey ? 'Kunci +5' : '0 Poin')}):</strong> ${escapeHTML(optText)}
          </div>
        `;
      });

      card.innerHTML = `
        <header class="review-card-header">
          <div style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
            <span class="badge-question-number">Soal No. ${q.id}</span>
            <span class="badge-question-category">${escapeHTML(q.kategori)} - ${escapeHTML(q.subkategori)}</span>
          </div>
          <div>${resultBadgeHtml}</div>
        </header>

        <div class="review-card-body">
          <div class="review-question-text">${q.soal}</div>
          ${q.media ? `<div class="question-media-wrapper" style="margin-bottom:0.75rem;">${q.media}</div>` : ''}
          <div class="review-options-grid">${optionsHtml}</div>

          <div class="review-pembahasan-box">
            <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:0.5rem; border-bottom:1px solid var(--border-color); padding-bottom:0.5rem;">
              <strong style="color:var(--bkn-primary); font-size:0.95rem;">Pembahasan & Analisis Resmi:</strong>
              <span class="badge-kunci-resmi">Kunci: ${escapeHTML(q.kategori === 'TKP' ? q.kunci + ' (Skor 5)' : q.kunci)}</span>
            </div>

            <div style="font-size:0.925rem; line-height:1.6; color:var(--text-main);">
              ${q.pembahasan}
            </div>

            <div style="margin-top:0.5rem;">
              <div style="font-size:0.825rem; font-weight:800; text-transform:uppercase; color:var(--text-muted); margin-bottom:0.35rem;">Analisis Setiap Opsi:</div>
              ${breakdownHtml}
            </div>

            <div class="tips-card" style="margin-top:0.5rem;">
              <svg class="tips-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
              </svg>
              <div class="tips-content">
                <div class="tips-title">Tips & Trik Cepat:</div>
                <div class="tips-text">${escapeHTML(q.tips)}</div>
              </div>
            </div>

            ${videoHtml}

            <div style="font-size:0.75rem; color:var(--text-muted); margin-top:0.35rem;">
              Sumber Resmi: <strong>${escapeHTML(q.sumber)}</strong>
            </div>
          </div>
        </div>
      `;

      DOM.reviewQuestionsList.appendChild(card);
    });
  }

  // --- 11. FINISH EXAM & RESULT MODAL ---

  function openConfirmFinishModal() {
    let answered = 0;
    let ragu = 0;
    let unanswered = 0;

    state.questions.forEach(q => {
      if (state.ragu[q.id]) ragu++;
      else if (state.answers[q.id]) answered++;
      else unanswered++;
    });

    if (DOM.confirmStatAnswered) DOM.confirmStatAnswered.textContent = answered;
    if (DOM.confirmStatRagu) DOM.confirmStatRagu.textContent = ragu;
    if (DOM.confirmStatUnanswered) DOM.confirmStatUnanswered.textContent = unanswered;

    if (DOM.confirmUnansweredWarning) {
      if (unanswered > 0 || ragu > 0) {
        DOM.confirmUnansweredWarning.style.display = 'flex';
      } else {
        DOM.confirmUnansweredWarning.style.display = 'none';
      }
    }

    if (DOM.modalConfirmFinish) {
      DOM.modalConfirmFinish.classList.add('open');
    }
  }

  function closeConfirmFinishModal() {
    if (DOM.modalConfirmFinish) {
      DOM.modalConfirmFinish.classList.remove('open');
    }
  }

  function finishExam(forceSubmit = false) {
    closeConfirmFinishModal();

    state.isFinished = true;
    state.finishTime = Date.now();
    pauseTimer();

    const results = calculateScores();

    // Populate Certificate Modal
    if (DOM.scoreValTwk) DOM.scoreValTwk.textContent = results.twkScore;
    if (DOM.scoreValTiu) DOM.scoreValTiu.textContent = results.tiuScore;
    if (DOM.scoreValTkp) DOM.scoreValTkp.textContent = results.tkpScore;
    if (DOM.scoreValTotal) DOM.scoreValTotal.textContent = results.totalScore;

    // Badges Status
    const setStatusBadge = (el, passed) => {
      if (!el) return;
      el.className = 'score-badge-status ' + (passed ? 'pass' : 'fail');
      el.textContent = passed ? 'MEMENUHI PG' : 'TIDAK LULUS';
    };

    setStatusBadge(DOM.badgeStatusTwk, results.passTWK);
    setStatusBadge(DOM.badgeStatusTiu, results.passTIU);
    setStatusBadge(DOM.badgeStatusTkp, results.passTKP);

    if (DOM.badgeStatusTotal) {
      DOM.badgeStatusTotal.className = 'score-badge-status ' + (results.passTotal ? 'pass' : 'fail');
      DOM.badgeStatusTotal.textContent = results.passTotal ? 'MEMENUHI NILAI' : 'TIDAK MEMENUHI';
    }

    // Final Banner
    if (DOM.finalStatusBanner) {
      DOM.finalStatusBanner.className = 'final-status-card ' + (results.passTotal ? 'pass' : 'fail');
    }

    if (DOM.finalStatusTitle) {
      DOM.finalStatusTitle.textContent = results.passTotal
        ? 'SELAMAT! MEMENUHI NILAI AMBANG BATAS SKD'
        : 'TIDAK MEMENUHI NILAI AMBANG BATAS SKD';
    }

    if (DOM.finalStatusDesc) {
      if (results.passTotal) {
        DOM.finalStatusDesc.textContent =
          `Nilai Anda memenuhi seluruh passing grade PermenPAN-RB (TWK: ${results.twkScore}/${CONFIG.PASSING_GRADES.TWK}, TIU: ${results.tiuScore}/${CONFIG.PASSING_GRADES.TIU}, TKP: ${results.tkpScore}/${CONFIG.PASSING_GRADES.TKP}). Berpeluang besar lolos ke tahapan SKB sesuai kuota formasi!`;
      } else {
        const failedAreas = [];
        if (!results.passTWK) failedAreas.push(`TWK (${results.twkScore} < ${CONFIG.PASSING_GRADES.TWK})`);
        if (!results.passTIU) failedAreas.push(`TIU (${results.tiuScore} < ${CONFIG.PASSING_GRADES.TIU})`);
        if (!results.passTKP) failedAreas.push(`TKP (${results.tkpScore} < ${CONFIG.PASSING_GRADES.TKP})`);

        DOM.finalStatusDesc.textContent =
          `Peserta dinyatakan BELUM MEMENUHI karena perolehan nilai pada sub-tes berikut masih di bawah passing grade: ${failedAreas.join(', ')}. Pelajari kembali melalui Review Pembahasan!`;
      }
    }

    // Exam Date & Duration in Certificate
    if (DOM.certExamDate) {
      DOM.certExamDate.textContent = formatIndonesianDate();
    }
    if (DOM.certExamDuration) {
      const timeSpentSec = Math.max(0, CONFIG.EXAM_DURATION_SECONDS - state.timeRemaining);
      const spentMin = Math.ceil(timeSpentSec / 60);
      DOM.certExamDuration.textContent = `${spentMin} Menit (${timeSpentSec} detik)`;
    }

    // Show Result Modal
    if (DOM.modalResult) {
      DOM.modalResult.classList.add('open');
    }

    // Unhide Review Tab in Subnav
    if (DOM.tabModeReview) {
      DOM.tabModeReview.style.display = 'inline-flex';
    }

    // Update Finish button label
    if (DOM.btnFinishExam && DOM.btnFinishExam.querySelector('span')) {
      DOM.btnFinishExam.querySelector('span').textContent = 'Sertifikat Nilai';
    }

    saveState();
  }

  function restartExam() {
    if (!confirm('Apakah Anda yakin ingin mengulang ujian simulasi dari awal? Seluruh jawaban dan catatan waktu akan direset.')) {
      return;
    }

    clearState();
    state.answers = {};
    state.ragu = {};
    state.visited = {};
    state.studyAnswers = {};
    state.studyRevealed = {};
    state.timeRemaining = CONFIG.EXAM_DURATION_SECONDS;
    state.currentIndex = 0;
    state.isFinished = false;
    state.mode = 'simulasi';

    if (DOM.modalResult) DOM.modalResult.classList.remove('open');
    if (DOM.tabModeReview) DOM.tabModeReview.style.display = 'none';
    if (DOM.btnFinishExam && DOM.btnFinishExam.querySelector('span')) {
      DOM.btnFinishExam.querySelector('span').textContent = 'Selesai Ujian';
    }

    switchMode('simulasi');
    startTimer();
    renderCurrentQuestion();
  }

  // --- 12. MODE SWITCHING CONTROLLER ---

  function switchMode(newMode) {
    state.mode = newMode;

    // Subnav tabs active class
    if (DOM.tabModeSimulasi) DOM.tabModeSimulasi.classList.toggle('active', newMode === 'simulasi');
    if (DOM.tabModeBelajar) DOM.tabModeBelajar.classList.toggle('active', newMode === 'belajar');
    if (DOM.tabModeReview) DOM.tabModeReview.classList.toggle('active', newMode === 'review');

    // Banner Mode Belajar
    if (DOM.bannerModeBelajar) {
      if (newMode === 'belajar') {
        DOM.bannerModeBelajar.classList.add('active');
      } else {
        DOM.bannerModeBelajar.classList.remove('active');
      }
    }

    // Toggle Review Sesi View vs Normal Viewport
    if (newMode === 'review') {
      if (DOM.questionCard) DOM.questionCard.style.display = 'none';
      if (DOM.reviewSessionView) {
        DOM.reviewSessionView.classList.add('active');
        renderReviewSessionView();
      }
    } else {
      if (DOM.questionCard) DOM.questionCard.style.display = 'block';
      if (DOM.reviewSessionView) {
        DOM.reviewSessionView.classList.remove('active');
      }
    }

    updateTimerDisplay();
    renderCurrentQuestion();
    saveState();
  }

  // --- 13. EVENT LISTENERS SETUP ---

  function initEventListeners() {
    // Mode Tabs
    if (DOM.tabModeSimulasi) {
      DOM.tabModeSimulasi.addEventListener('click', () => switchMode('simulasi'));
    }
    if (DOM.tabModeBelajar) {
      DOM.tabModeBelajar.addEventListener('click', () => switchMode('belajar'));
    }
    if (DOM.tabModeReview) {
      DOM.tabModeReview.addEventListener('click', () => switchMode('review'));
    }

    // Finish Exam Button
    if (DOM.btnFinishExam) {
      DOM.btnFinishExam.addEventListener('click', () => {
        if (state.isFinished) {
          if (DOM.modalResult) DOM.modalResult.classList.add('open');
        } else {
          openConfirmFinishModal();
        }
      });
    }

    // Modal Confirmation Actions
    if (DOM.btnCancelFinish) {
      DOM.btnCancelFinish.addEventListener('click', closeConfirmFinishModal);
    }
    if (DOM.btnSubmitExamFinal) {
      DOM.btnSubmitExamFinal.addEventListener('click', () => finishExam(false));
    }

    // Modal backdrop click to close
    [DOM.modalConfirmFinish, DOM.modalResult].forEach(modal => {
      if (modal) {
        modal.addEventListener('click', (e) => {
          if (e.target === modal) {
            modal.classList.remove('open');
          }
        });
      }
    });

    // Navigation Controls
    if (DOM.btnPrev) {
      DOM.btnPrev.addEventListener('click', () => {
        if (state.currentIndex > 0) {
          state.currentIndex--;
          renderCurrentQuestion();
        }
      });
    }

    if (DOM.btnNext) {
      DOM.btnNext.addEventListener('click', () => {
        if (state.currentIndex < state.questions.length - 1) {
          state.currentIndex++;
          renderCurrentQuestion();
        } else {
          // If on last question, open finish modal
          openConfirmFinishModal();
        }
      });
    }

    if (DOM.btnSkip) {
      DOM.btnSkip.addEventListener('click', () => {
        if (state.currentIndex < state.questions.length - 1) {
          state.currentIndex++;
          renderCurrentQuestion();
        }
      });
    }

    // Ragu-Ragu Button & Checkbox
    const toggleRagu = () => {
      const q = state.questions[state.currentIndex];
      if (!q) return;
      state.ragu[q.id] = !state.ragu[q.id];
      renderCurrentQuestion();
    };

    if (DOM.btnRagu) {
      DOM.btnRagu.addEventListener('click', (e) => {
        if (e.target !== DOM.checkboxRagu) {
          toggleRagu();
        }
      });
    }
    if (DOM.checkboxRagu) {
      DOM.checkboxRagu.addEventListener('change', toggleRagu);
    }

    // Study Mode Controls
    if (DOM.btnToggleStudyPembahasan) {
      DOM.btnToggleStudyPembahasan.addEventListener('click', () => {
        if (!DOM.pembahasanBox) return;
        const q = state.questions[state.currentIndex];
        const isCurrentlyVisible = DOM.pembahasanBox.classList.contains('visible');
        if (isCurrentlyVisible) {
          DOM.pembahasanBox.classList.remove('visible');
          DOM.btnToggleStudyPembahasan.querySelector('span').textContent = 'Buka Pembahasan';
          if (DOM.videoIframe) DOM.videoIframe.src = '';
        } else {
          renderPembahasan(q, state.studyAnswers[q.id] || state.answers[q.id]);
          DOM.pembahasanBox.classList.add('visible');
          DOM.btnToggleStudyPembahasan.querySelector('span').textContent = 'Tutup Pembahasan';
        }
      });
    }

    if (DOM.btnRetryQuestion) {
      DOM.btnRetryQuestion.addEventListener('click', () => {
        const q = state.questions[state.currentIndex];
        if (!q) return;
        delete state.studyAnswers[q.id];
        delete state.studyRevealed[q.id];
        delete state.answers[q.id];
        if (DOM.pembahasanBox) DOM.pembahasanBox.classList.remove('visible');
        renderCurrentQuestion();
      });
    }

    // Subfilter Tabs for Question Grid (Sidebar)
    if (DOM.gridSubfilterTabs) {
      DOM.gridSubfilterTabs.forEach(tab => {
        tab.addEventListener('click', () => {
          DOM.gridSubfilterTabs.forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          state.gridRangeFilter = tab.getAttribute('data-grid-range') || 'all';
          renderGridButtons();
        });
      });
    }

    // Category Filter Badges in Subnav
    if (DOM.categoryFilterBtns) {
      DOM.categoryFilterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          DOM.categoryFilterBtns.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const filter = btn.getAttribute('data-category-filter') || 'all';
          state.categoryFilter = filter;

          // Jump to first question of this category
          if (filter !== 'all') {
            const firstIdx = state.questions.findIndex(q => q.kategori === filter);
            if (firstIdx !== -1) {
              state.currentIndex = firstIdx;
              if (DOM.questionCard) DOM.questionCard.style.display = 'block';
              if (DOM.reviewSessionView) DOM.reviewSessionView.classList.remove('active');
              renderCurrentQuestion();
            }
          }
        });
      });
    }

    // Review Session Filter Chips
    if (DOM.reviewFilterChips) {
      DOM.reviewFilterChips.forEach(chip => {
        chip.addEventListener('click', () => {
          DOM.reviewFilterChips.forEach(c => c.classList.remove('active'));
          chip.classList.add('active');
          state.reviewFilter = chip.getAttribute('data-review-filter') || 'all';
          renderReviewSessionView();
        });
      });
    }

    // Button: Back to Exam from Review
    if (DOM.btnBackToExamFromReview) {
      DOM.btnBackToExamFromReview.addEventListener('click', () => {
        if (DOM.questionCard) DOM.questionCard.style.display = 'block';
        if (DOM.reviewSessionView) DOM.reviewSessionView.classList.remove('active');
        renderCurrentQuestion();
      });
    }

    // Result Modal Actions
    if (DOM.btnOpenReview) {
      DOM.btnOpenReview.addEventListener('click', () => {
        if (DOM.modalResult) DOM.modalResult.classList.remove('open');
        switchMode('review');
      });
    }

    if (DOM.btnPrintResult) {
      DOM.btnPrintResult.addEventListener('click', () => {
        window.print();
      });
    }

    if (DOM.btnRestartExam) {
      DOM.btnRestartExam.addEventListener('click', restartExam);
    }

    // Font Sizing
    const setFontSize = (sizeClass) => {
      document.body.classList.remove('font-sm', 'font-md', 'font-lg');
      document.body.classList.add(sizeClass);
      state.fontSize = sizeClass;
      if (DOM.btnFontDec) DOM.btnFontDec.classList.toggle('active', sizeClass === 'font-sm');
      if (DOM.btnFontReset) DOM.btnFontReset.classList.toggle('active', sizeClass === 'font-md');
      if (DOM.btnFontInc) DOM.btnFontInc.classList.toggle('active', sizeClass === 'font-lg');
      saveState();
    };

    if (DOM.btnFontDec) DOM.btnFontDec.addEventListener('click', () => setFontSize('font-sm'));
    if (DOM.btnFontReset) DOM.btnFontReset.addEventListener('click', () => setFontSize('font-md'));
    if (DOM.btnFontInc) DOM.btnFontInc.addEventListener('click', () => setFontSize('font-lg'));

    // Keyboard Shortcuts Navigation
    window.addEventListener('keydown', (e) => {
      // Don't trigger shortcuts inside text inputs or when confirmation modal is open
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      if (DOM.modalConfirmFinish && DOM.modalConfirmFinish.classList.contains('open')) {
        if (e.key === 'Escape') closeConfirmFinishModal();
        return;
      }
      if (DOM.modalResult && DOM.modalResult.classList.contains('open')) {
        if (e.key === 'Escape') DOM.modalResult.classList.remove('open');
        return;
      }

      const q = state.questions[state.currentIndex];
      if (!q) return;

      if (e.key === 'ArrowLeft') {
        if (state.currentIndex > 0) {
          state.currentIndex--;
          renderCurrentQuestion();
        }
      } else if (e.key === 'ArrowRight') {
        if (state.currentIndex < state.questions.length - 1) {
          state.currentIndex++;
          renderCurrentQuestion();
        }
      } else if (['1', 'a', 'A'].includes(e.key)) {
        selectOption(q, 'A');
      } else if (['2', 'b', 'B'].includes(e.key)) {
        selectOption(q, 'B');
      } else if (['3', 'c', 'C'].includes(e.key)) {
        selectOption(q, 'C');
      } else if (['4', 'd', 'D'].includes(e.key)) {
        selectOption(q, 'D');
      } else if (['5', 'e', 'E'].includes(e.key)) {
        selectOption(q, 'E');
      } else if (['r', 'R'].includes(e.key)) {
        toggleRagu();
      }
    });
  }

  // --- 14. INITIALIZATION ---

  function initializeApp() {
    console.log('[CAT BKN] Menginisialisasi sistem ujian simulasi...');

    // Load questions from window.SKD_QUESTIONS
    let rawQuestions = window.SKD_QUESTIONS;

    if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) {
      console.warn('[CAT BKN] window.SKD_QUESTIONS belum terdefinisi. Menunggu pemuatan file data/questions.js...');
      let checkAttempts = 0;
      const interval = setInterval(() => {
        checkAttempts++;
        if (Array.isArray(window.SKD_QUESTIONS) && window.SKD_QUESTIONS.length > 0) {
          clearInterval(interval);
          setupQuestions(window.SKD_QUESTIONS);
        } else if (checkAttempts > 30) {
          clearInterval(interval);
          console.error('[CAT BKN] Gagal memuat data/questions.js setelah 30 percobaan.');
        }
      }, 200);
      return;
    }

    setupQuestions(rawQuestions);
  }

  function setupQuestions(rawQuestions) {
    state.questions = rawQuestions.map((q, idx) => normalizeQuestion(q, idx));
    console.log(`[CAT BKN] Berhasil memuat ${state.questions.length} soal resmi SKD.`);

    // Restore previous state if available
    const hasPrevious = loadState();

    // Initialize Event Handlers
    initEventListeners();

    // Restore Font Size
    if (state.fontSize) {
      document.body.classList.remove('font-sm', 'font-md', 'font-lg');
      document.body.classList.add(state.fontSize);
      if (DOM.btnFontDec) DOM.btnFontDec.classList.toggle('active', state.fontSize === 'font-sm');
      if (DOM.btnFontReset) DOM.btnFontReset.classList.toggle('active', state.fontSize === 'font-md');
      if (DOM.btnFontInc) DOM.btnFontInc.classList.toggle('active', state.fontSize === 'font-lg');
    }

    // Set Candidate Initial Avatar
    if (DOM.candidateAvatar) {
      DOM.candidateAvatar.textContent = 'ASN';
    }

    // Check Finished State
    if (state.isFinished) {
      if (DOM.tabModeReview) DOM.tabModeReview.style.display = 'inline-flex';
      if (DOM.btnFinishExam && DOM.btnFinishExam.querySelector('span')) {
        DOM.btnFinishExam.querySelector('span').textContent = 'Sertifikat Nilai';
      }
      switchMode('review');
    } else {
      switchMode(state.mode || 'simulasi');
      startTimer();
    }

    renderCurrentQuestion();
    renderSidebar();
  }

  // Execute on DOM Ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
  } else {
    initializeApp();
  }

})();
