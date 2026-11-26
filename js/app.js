/**
 * ============================================================================
 * CAT ASSESSMENT SYSTEM - SKD CASN
 * Core Application Engine, Scoring Logic, SQLite History & Bank Soal CRUD
 * Conforms to KepmenPAN-RB No. 674 Tahun 2026 Standards
 * ============================================================================
 */

(function () {
  'use strict';

  // --- 1. CONFIGURATION & PERMENPAN-RB STANDARDS ---
  const CONFIG = {
    STORAGE_KEY: 'CAT_SIMULASI_STATE_V3',
    HISTORY_FALLBACK_KEY: 'CAT_HISTORY_SESSIONS_V3',
    BANK_FALLBACK_KEY: 'CAT_BANK_SOAL_LOCAL_V3',
    IDB_NAME: 'CAT_CASN_SQLITE_STORAGE',
    IDB_STORE: 'sqlite_store',
    IDB_KEY: 'database_file',
    AUTH_SALT: 'CAT_SKD_2026_SALT_',
    AUTH_HASH: '82f5bacfb16f052a221735719214613fa29d3110c5295ff5ba38195267d387bd',
    RATE_LIMIT_KEY: 'CAT_AUTH_RATE_LIMIT',
    EXAM_DURATION_SECONDS: 100 * 60, // 100 minutes (6,000 seconds)
    PASSING_GRADES: {
      TWK: 65,  // Nilai Ambang Batas TWK
      TIU: 80,  // Nilai Ambang Batas TIU
      TKP: 166, // Nilai Ambang Batas TKP
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
    isAuthenticated: false,       // In-memory only (not persisted in localStorage)
    currentScreen: 'landing',     // 'landing' | 'exam' | 'history' | 'bank-soal'
    mode: 'simulasi',             // 'simulasi' | 'belajar' | 'review'
    currentIndex: 0,              // 0-indexed across normalized questions
    questions: [],                // Normalized active questions list for simulation/study
    allBankQuestions: [],         // Full questions list (active + inactive) for Bank Soal
    answers: {},                  // { [qId]: 'A' | 'B' | 'C' | 'D' | 'E' }
    ragu: {},                     // { [qId]: boolean }
    visited: {},                  // { [qId]: boolean }
    timeRemaining: CONFIG.EXAM_DURATION_SECONDS,
    timerInterval: null,
    isFinished: false,
    startTime: null,
    finishTime: null,
    activeSessionId: null,        // Set when evaluating a saved session from SQLite
    activeSessionMeta: null,
    categoryFilter: 'all',        // 'all' | 'TWK' | 'TIU' | 'TKP'
    gridRangeFilter: 'all',       // 'all' | 'TWK' | 'TIU' | 'TKP'
    reviewFilter: 'all',          // 'all' | 'wrong' | 'correct' | 'ragu' | 'TWK' | 'TIU' | 'TKP'
    studyRevealed: {},            // { [qId]: boolean } in study mode
    studyAnswers: {},             // { [qId]: 'A'|'B'|... } in study mode
    fontSize: 'font-md',          // 'font-sm' | 'font-md' | 'font-lg'

    // Bank Soal View State
    bankFilterCat: 'all',
    bankFilterStatus: 'all',
    bankSearchQuery: '',
    editingQuestionId: null,
    deletingQuestionObj: null,
    currentDetailQuestionObj: null
  };

  // --- 3. DOM ELEMENT CACHE ---
  const DOM = {
    // Auth Gate
    authGateScreen: document.getElementById('auth-gate-screen'),
    authGateForm: document.getElementById('auth-gate-form'),
    authPasswordInput: document.getElementById('auth-password-input'),
    btnTogglePassword: document.getElementById('btn-toggle-password'),
    iconEyeShow: document.getElementById('icon-eye-show'),
    iconEyeHide: document.getElementById('icon-eye-hide'),
    authErrorMsg: document.getElementById('auth-error-msg'),
    btnAuthSubmit: document.getElementById('btn-auth-submit'),

    // Screens
    landingScreen: document.getElementById('landing-screen'),
    examScreen: document.getElementById('exam-screen'),
    historyScreen: document.getElementById('history-screen'),
    bankSoalScreen: document.getElementById('bank-soal-screen'),

    // Top Header
    brandHomeLink: document.getElementById('brand-home-link'),
    btnHeaderHistory: document.getElementById('btn-header-history'),
    btnHeaderBankSoal: document.getElementById('btn-header-bank-soal'),
    timerBox: document.getElementById('timer-box'),
    timerCountdown: document.getElementById('timer-countdown'),
    btnFinishExam: document.getElementById('btn-finish-exam'),
    candidateAvatar: document.getElementById('candidate-photo-avatar'),
    candidateName: document.getElementById('candidate-name'),
    candidateId: document.getElementById('candidate-id'),
    candidatePin: document.getElementById('candidate-pin'),

    // Landing Screen Elements
    btnStartStudy: document.getElementById('btn-start-study'),
    btnStartSimulation: document.getElementById('btn-start-simulation'),
    btnViewHistory: document.getElementById('btn-view-history'),
    btnViewBankSoal: document.getElementById('btn-view-bank-soal'),

    // Exam Subnav & Mode Lock
    btnExamBackHome: document.getElementById('btn-exam-back-home'),
    badgeSimLocked: document.getElementById('badge-sim-locked'),
    modeTabsWrap: document.getElementById('mode-tabs-wrap'),
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

    // Question Viewport
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
    videoTimestampBadge: document.getElementById('video-timestamp-badge'),
    videoChannelText: document.getElementById('video-channel-text'),
    videoIframe: document.getElementById('video-iframe'),
    videoDirectLink: document.getElementById('video-direct-link'),
    sourceBox: document.getElementById('source-box'),
    sourceText: document.getElementById('source-text'),

    // Review Session View
    reviewSessionView: document.getElementById('review-session-view'),
    reviewSessionInfoBanner: document.getElementById('review-session-info-banner'),
    reviewSessionInfoText: document.getElementById('review-session-info-text'),
    btnBackToHistoryFromReview: document.getElementById('btn-back-to-history-from-review'),
    btnBackToHomeFromReview: document.getElementById('btn-back-to-home-from-review'),
    reviewFilterChips: document.querySelectorAll('[data-review-filter]'),
    reviewQuestionsList: document.getElementById('review-questions-list'),
    btnBackToExamFromReview: document.getElementById('btn-back-to-exam-from-review'),

    // Mobile Drawer & Bottom Action Bar
    sidebarViewport: document.getElementById('sidebar-viewport'),
    mobileDrawerBackdrop: document.getElementById('mobile-drawer-backdrop'),
    btnCloseMobileDrawer: document.getElementById('btn-close-mobile-drawer'),
    mobileBottomBar: document.getElementById('mobile-bottom-bar'),
    btnMobilePrev: document.getElementById('btn-mobile-prev'),
    btnMobileRagu: document.getElementById('btn-mobile-ragu'),
    btnMobileGridDrawer: document.getElementById('btn-mobile-grid-drawer'),
    mobileGridCounter: document.getElementById('mobile-grid-counter'),
    btnMobileNext: document.getElementById('btn-mobile-next'),

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

    // Session History Screen
    btnHistoryBack: document.getElementById('btn-history-back'),
    btnResetAllHistory: document.getElementById('btn-reset-all-history'),
    btnHistoryExportDb: document.getElementById('btn-history-export-db'),
    btnHistoryImportDbTrigger: document.getElementById('btn-history-import-db-trigger'),
    inputHistoryImportDb: document.getElementById('input-history-import-db'),
    statHistoryTotal: document.getElementById('stat-history-total'),
    statHistoryPassed: document.getElementById('stat-history-passed'),
    statHistoryHighest: document.getElementById('stat-history-highest'),
    statHistoryAvg: document.getElementById('stat-history-avg'),
    historyTableContainer: document.getElementById('history-table-container'),
    historyTableBody: document.getElementById('history-table-body'),
    historyEmptyState: document.getElementById('history-empty-state'),
    btnEmptyStartSim: document.getElementById('btn-empty-start-sim'),

    // Screen 4: Bank Soal Management
    btnBankSoalBack: document.getElementById('btn-bank-soal-back'),
    btnAddQuestion: document.getElementById('btn-add-question'),
    btnExportDb: document.getElementById('btn-export-db'),
    btnImportDbTrigger: document.getElementById('btn-import-db-trigger'),
    inputImportDb: document.getElementById('input-import-db'),
    sqliteStatusBadge: document.getElementById('sqlite-status-badge'),
    bankSoalSearch: document.getElementById('bank-soal-search'),
    bankSoalFilterCat: document.getElementById('bank-soal-filter-cat'),
    bankSoalFilterStatus: document.getElementById('bank-soal-filter-status'),
    bankSoalCountBadge: document.getElementById('bank-soal-count-badge'),
    bankSoalTable: document.getElementById('bank-soal-table'),
    bankSoalTableBody: document.getElementById('bank-soal-table-body'),
    bankSoalEmptyState: document.getElementById('bank-soal-empty-state'),
    btnResetBankFilters: document.getElementById('btn-reset-bank-filters'),

    // Modal Form Tambah/Edit Soal
    modalQuestionForm: document.getElementById('modal-question-form'),
    formQuestion: document.getElementById('form-question'),
    formQuestionId: document.getElementById('form-question-id'),
    formTitleText: document.getElementById('form-title-text'),
    btnCloseFormX: document.getElementById('btn-close-form-x'),
    formKategori: document.getElementById('form-kategori'),
    formSubkategori: document.getElementById('form-subkategori'),
    formIsActive: document.getElementById('form-is-active'),
    formSoal: document.getElementById('form-soal'),
    formHasImage: document.getElementById('form-has-image'),
    formImageData: document.getElementById('form-image-data'),
    formKunci: document.getElementById('form-kunci'),
    formOpsiA: document.getElementById('form-opsi-A'),
    formBobotA: document.getElementById('form-bobot-A'),
    formOpsiB: document.getElementById('form-opsi-B'),
    formBobotB: document.getElementById('form-bobot-B'),
    formOpsiC: document.getElementById('form-opsi-C'),
    formBobotC: document.getElementById('form-bobot-C'),
    formOpsiD: document.getElementById('form-opsi-D'),
    formBobotD: document.getElementById('form-bobot-D'),
    formOpsiE: document.getElementById('form-opsi-E'),
    formBobotE: document.getElementById('form-bobot-E'),
    formPembahasan: document.getElementById('form-pembahasan'),
    formAnalisisA: document.getElementById('form-analisis-A'),
    formAnalisisB: document.getElementById('form-analisis-B'),
    formAnalisisC: document.getElementById('form-analisis-C'),
    formAnalisisD: document.getElementById('form-analisis-D'),
    formAnalisisE: document.getElementById('form-analisis-E'),
    formTips: document.getElementById('form-tips'),
    formVideoUrl: document.getElementById('form-video-url'),
    formVideoTitle: document.getElementById('form-video-title'),
    formVideoChannel: document.getElementById('form-video-channel'),
    formVideoTimestamp: document.getElementById('form-video-timestamp'),
    formVideoStartSeconds: document.getElementById('form-video-start-seconds'),
    formSumberNama: document.getElementById('form-sumber-nama'),
    formSumberUrl: document.getElementById('form-sumber-url'),
    formSumberHalaman: document.getElementById('form-sumber-halaman'),
    formSumberNo: document.getElementById('form-sumber-no'),
    btnCancelForm: document.getElementById('btn-cancel-form'),
    btnSaveQuestion: document.getElementById('btn-save-question'),

    // Modal Detail Preview Soal
    modalQuestionDetail: document.getElementById('modal-question-detail'),
    detailHeaderText: document.getElementById('detail-header-text'),
    btnCloseDetailX: document.getElementById('btn-close-detail-x'),
    detailBadgeId: document.getElementById('detail-badge-id'),
    detailBadgeCat: document.getElementById('detail-badge-cat'),
    detailBadgeSubcat: document.getElementById('detail-badge-subcat'),
    detailBadgeStatus: document.getElementById('detail-badge-status'),
    detailSoalText: document.getElementById('detail-soal-text'),
    detailMediaContainer: document.getElementById('detail-media-container'),
    detailOptionsContainer: document.getElementById('detail-options-container'),
    detailPembahasanText: document.getElementById('detail-pembahasan-text'),
    detailAnalysisContainer: document.getElementById('detail-analysis-container'),
    detailTipsBox: document.getElementById('detail-tips-box'),
    detailTipsText: document.getElementById('detail-tips-text'),
    detailVideoContainer: document.getElementById('detail-video-container'),
    detailVideoIframe: document.getElementById('detail-video-iframe'),
    detailVideoTitle: document.getElementById('detail-video-title'),
    detailVideoTimestamp: document.getElementById('detail-video-timestamp'),
    detailVideoChannel: document.getElementById('detail-video-channel'),
    detailVideoLink: document.getElementById('detail-video-link'),
    detailSourceCard: document.getElementById('detail-source-card'),
    detailSumberNama: document.getElementById('detail-sumber-nama'),
    detailSumberUrl: document.getElementById('detail-sumber-url'),
    detailSumberHalaman: document.getElementById('detail-sumber-halaman'),
    detailSumberNo: document.getElementById('detail-sumber-no'),
    btnCloseDetail: document.getElementById('btn-close-detail'),
    btnDetailToEdit: document.getElementById('btn-detail-to-edit'),

    // Modal Delete Confirm
    modalConfirmDeleteQ: document.getElementById('modal-confirm-delete-q'),
    deleteQSnippet: document.getElementById('delete-q-snippet'),
    btnCancelDeleteQ: document.getElementById('btn-cancel-delete-q'),
    btnConfirmDeleteQ: document.getElementById('btn-confirm-delete-q'),

    // Modals Selesai & Hasil
    modalConfirmFinish: document.getElementById('modal-confirm-finish'),
    confirmStatAnswered: document.getElementById('confirm-stat-answered'),
    confirmStatRagu: document.getElementById('confirm-stat-ragu'),
    confirmStatUnanswered: document.getElementById('confirm-stat-unanswered'),
    confirmUnansweredWarning: document.getElementById('confirm-unanswered-warning'),
    btnCancelFinish: document.getElementById('btn-cancel-finish'),
    btnSubmitExamFinal: document.getElementById('btn-submit-exam-final'),

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
    btnOpenHistoryFromCert: document.getElementById('btn-open-history-from-cert'),
    btnPrintResult: document.getElementById('btn-print-result'),
    btnRestartExam: document.getElementById('btn-restart-exam')
  };

  // --- 4. UTILITIES & HELPERS ---

  function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function extractYouTubeVideoId(url) {
    if (!url || typeof url !== 'string') return '';
    const match = url.match(/(?:embed\/|watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
    return match ? match[1] : '';
  }

  function extractYouTubeStartSeconds(url) {
    if (!url || typeof url !== 'string') return 0;
    const match = url.match(/[?&](?:start|t)=(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  function formatTimestamp(seconds) {
    if (!seconds || seconds <= 0) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  function parseTimestampToSeconds(ts) {
    if (!ts) return 0;
    if (typeof ts === 'number') return Math.floor(ts);
    if (typeof ts === 'string') {
      const parts = ts.trim().split(':');
      if (parts.length === 2) {
        return (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);
      }
      if (parts.length === 3) {
        return (parseInt(parts[0], 10) || 0) * 3600 + (parseInt(parts[1], 10) || 0) * 60 + (parseInt(parts[2], 10) || 0);
      }
      const num = parseInt(ts, 10);
      return !isNaN(num) ? num : 0;
    }
    return 0;
  }

  function toYouTubeEmbedUrl(url, startSec = 0) {
    if (!url || typeof url !== 'string') return '';
    const id = extractYouTubeVideoId(url);
    if (!id) return url;
    const sec = startSec > 0 ? startSec : extractYouTubeStartSeconds(url);
    let embed = `https://www.youtube-nocookie.com/embed/${id}?rel=0&enablejsapi=1`;
    if (sec > 0) {
      embed += `&start=${sec}`;
    }
    return embed;
  }

  function toYouTubeWatchUrl(url, startSec = 0) {
    if (!url || typeof url !== 'string') return '#';
    const id = extractYouTubeVideoId(url);
    if (!id) return url;
    const sec = startSec > 0 ? startSec : extractYouTubeStartSeconds(url);
    let watch = `https://www.youtube.com/watch?v=${id}`;
    if (sec > 0) {
      watch += `&t=${sec}s`;
    }
    return watch;
  }

  function formatIndonesianDate(d = new Date()) {
    const months = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  }

  function formatTime(seconds) {
    const safeSec = Math.max(0, Math.floor(seconds));
    const mins = Math.floor(safeSec / 60);
    const secs = safeSec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  function normalizeQuestion(raw, index) {
    const id = raw.id || raw.no || (index + 1);
    
    let kategori = (raw.kategori || raw.category || '').toUpperCase().trim();
    if (!kategori) {
      if (index < 30) kategori = 'TWK';
      else if (index < 65) kategori = 'TIU';
      else kategori = 'TKP';
    }

    const subkategori = raw.subkategori || raw.materi || raw.topik || 
      (kategori === 'TWK' ? 'Wawasan Kebangsaan' : 
       kategori === 'TIU' ? 'Inteligensi Umum' : 'Karakteristik Pribadi');

    const soal = raw.soal || raw.pertanyaan || raw.question || '';
    const hasImage = (raw.has_image || !emptyMedia(raw.media || raw.gambar || raw.image_data)) ? 1 : 0;
    const imageData = raw.image_data || raw.media || raw.gambar || null;

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
        opsi[k] = rawOptions[k] || rawOptions[k.toLowerCase()] || raw[`opsi_${k.toLowerCase()}`] || '';
      });
    }

    let kunci = String(raw.kunci || raw.kunci_jawaban || raw.jawaban_benar || raw.jawaban || 'A').toUpperCase().trim();
    if (kunci.length > 1) kunci = kunci.charAt(0);

    let bobot = {};
    if (kategori === 'TKP') {
      const rawBobot = raw.bobot || raw.points || raw.skor_opsi || {};
      optionKeys.forEach((k, idx) => {
        let weight = rawBobot[k] ?? rawBobot[k.toLowerCase()] ?? raw[`bobot_${k.toLowerCase()}`];
        if (typeof weight !== 'number') {
          if (Array.isArray(rawOptions) && rawOptions[idx] && typeof rawOptions[idx].skor === 'number') {
            weight = rawOptions[idx].skor;
          } else {
            weight = 5 - idx;
          }
        }
        bobot[k] = Number(weight);
      });
      const bestOpt = optionKeys.find(k => bobot[k] === 5);
      if (bestOpt) kunci = bestOpt;
    } else {
      optionKeys.forEach(k => {
        bobot[k] = (k === kunci) ? 5 : 0;
      });
    }

    const pembahasan = raw.pembahasan || raw.penjelasan || raw.explanation || 'Pembahasan materi resmi CAT SKD.';
    const rawAnalisis = raw.analisis_opsi || raw.alasan_opsi || raw.pembahasan_opsi || {};
    const analisis_opsi = {};
    optionKeys.forEach(k => {
      analisis_opsi[k] = rawAnalisis[k] || rawAnalisis[k.toLowerCase()] || raw[`analisis_${k.toLowerCase()}`] || 
        (k === kunci ? `Opsi ${k} adalah jawaban paling tepat sesuai substansi materi.` : `Opsi ${k} kurang tepat.`);
    });

    const tips = raw.tips || raw.trik || raw.rumus || 'Gunakan eliminasi opsi yang tidak logis dan cermati kata kunci pokok soal.';
    
    const sumberNama = raw.sumber_nama || raw.sumber || 'KepmenPAN-RB No. 674 Tahun 2026';
    const sumberUrl = raw.sumber_url || 'https://menpan.go.id';
    const sumberHalaman = raw.sumber_halaman || '';
    const sumberNoSoal = raw.sumber_no_soal || `Butir #${id}`;

    let video = null;
    const rawVideo = raw.video || raw.youtube || raw.youtube_url || raw.video_url || null;
    if (rawVideo) {
      let vUrl = '';
      let vTitle = `Video Pembahasan Soal No. ${id} - ${subkategori}`;
      let vChannel = 'Edukasi CASN BKN';
      let vStart = 0;
      let vTimestamp = '';
      let vTopic = '';

      if (typeof rawVideo === 'string') {
        vUrl = rawVideo;
        vStart = extractYouTubeStartSeconds(rawVideo);
      } else if (typeof rawVideo === 'object') {
        vUrl = rawVideo.url || rawVideo.embedUrl || rawVideo.src || '';
        vTitle = rawVideo.title || raw.video_title || vTitle;
        vChannel = rawVideo.channel || raw.video_channel || vChannel;
        vTopic = rawVideo.topic_part || rawVideo.topic || raw.video_topic || '';
        if (rawVideo.startSeconds !== undefined && rawVideo.startSeconds !== null) {
          vStart = parseInt(rawVideo.startSeconds, 10) || 0;
        } else if (rawVideo.start !== undefined && rawVideo.start !== null) {
          vStart = parseInt(rawVideo.start, 10) || 0;
        } else if (rawVideo.timestamp) {
          vStart = parseTimestampToSeconds(rawVideo.timestamp);
        } else {
          vStart = extractYouTubeStartSeconds(vUrl);
        }
        vTimestamp = rawVideo.timestamp || (vStart > 0 ? formatTimestamp(vStart) : '');
      }

      if (!vTimestamp && vStart > 0) {
        vTimestamp = formatTimestamp(vStart);
      }

      video = {
        url: toYouTubeEmbedUrl(vUrl, vStart),
        watchUrl: toYouTubeWatchUrl(vUrl, vStart),
        title: vTitle,
        channel: vChannel,
        startSeconds: vStart,
        timestamp: vTimestamp,
        topic_part: vTopic
      };
    }

    const isActive = (raw.is_active !== undefined && raw.is_active !== null) ? (raw.is_active ? 1 : 0) : 1;

    return {
      id,
      index,
      kategori,
      subkategori,
      soal,
      has_image: hasImage,
      image_data: imageData,
      media: imageData,
      opsi,
      kunci,
      bobot,
      pembahasan,
      analisis_opsi,
      tips,
      sumber_nama: sumberNama,
      sumber_url: sumberUrl,
      sumber_halaman: sumberHalaman,
      sumber_no_soal: sumberNoSoal,
      sumber: sumberNama ? (sumberNama + (sumberHalaman ? ` (Hal: ${sumberHalaman})` : '')) : 'KepmenPAN-RB',
      video,
      video_url: video ? video.url : '',
      video_title: video ? video.title : '',
      video_channel: video ? video.channel : '',
      is_active: isActive
    };
  }

  function emptyMedia(val) {
    return !val || String(val).trim() === '';
  }

  // --- 5. SCREEN MANAGEMENT CONTROLLER ---

  function showScreen(targetScreen) {
    state.currentScreen = targetScreen;

    if (DOM.landingScreen) DOM.landingScreen.classList.remove('active');
    if (DOM.examScreen) DOM.examScreen.classList.remove('active');
    if (DOM.historyScreen) DOM.historyScreen.classList.remove('active');
    if (DOM.bankSoalScreen) DOM.bankSoalScreen.classList.remove('active');

    // Close any playing video
    if (DOM.videoIframe) DOM.videoIframe.src = '';
    if (DOM.detailVideoIframe) DOM.detailVideoIframe.src = '';

    if (targetScreen === 'landing') {
      if (DOM.landingScreen) DOM.landingScreen.classList.add('active');
      if (DOM.timerBox) DOM.timerBox.style.display = 'none';
      if (DOM.btnFinishExam) DOM.btnFinishExam.style.display = 'none';
      document.body.classList.remove('simulation-mode-active');
      pauseTimer();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (targetScreen === 'history') {
      if (DOM.historyScreen) DOM.historyScreen.classList.add('active');
      if (DOM.timerBox) DOM.timerBox.style.display = 'none';
      if (DOM.btnFinishExam) DOM.btnFinishExam.style.display = 'none';
      document.body.classList.remove('simulation-mode-active');
      pauseTimer();
      loadAndRenderHistory();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (targetScreen === 'bank-soal') {
      if (DOM.bankSoalScreen) DOM.bankSoalScreen.classList.add('active');
      if (DOM.timerBox) DOM.timerBox.style.display = 'none';
      if (DOM.btnFinishExam) DOM.btnFinishExam.style.display = 'none';
      document.body.classList.remove('simulation-mode-active');
      pauseTimer();
      loadAndRenderBankSoal();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (targetScreen === 'exam') {
      if (DOM.examScreen) DOM.examScreen.classList.add('active');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  // --- 6. LOCAL STORAGE PERSISTENCE (ACTIVE SIMULATION) ---

  function saveActiveExamState() {
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
    }
  }

  function loadActiveExamState() {
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
    }
    return false;
  }

  function clearActiveExamState() {
    try {
      localStorage.removeItem(CONFIG.STORAGE_KEY);
    } catch (e) {
    }
  }

  // --- 7. SCORING ENGINE (PERMENPAN-RB) ---

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
        id: q.id,
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

  // --- 8. TIMER CONTROLLER (SIMULASI CAT) ---

  function startTimer() {
    if (state.timerInterval) clearInterval(state.timerInterval);

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
        alert('WAKTU 100 MENIT TELAH HABIS!\nSistem otomatis mengunci dan mengirim lembar jawaban Anda untuk dinilai.');
        finishExam(true);
        return;
      }

      updateTimerDisplay();

      if (state.timeRemaining % 10 === 0) {
        saveActiveExamState();
      }
    }, 1000);
  }

  function updateTimerDisplay() {
    if (!DOM.timerCountdown) return;

    if (state.mode === 'belajar') {
      DOM.timerCountdown.textContent = 'BELAJAR';
      if (DOM.timerBox) DOM.timerBox.classList.remove('warning', 'danger');
      return;
    }

    if (state.mode === 'review' || state.isFinished) {
      DOM.timerCountdown.textContent = 'SELESAI';
      if (DOM.timerBox) DOM.timerBox.classList.remove('warning', 'danger');
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

  // --- 9. QUESTION VIEWPORT RENDERING ---

  function renderCurrentQuestion() {
    if (!state.questions || state.questions.length === 0) return;

    if (state.currentIndex < 0) state.currentIndex = 0;
    if (state.currentIndex >= state.questions.length) {
      state.currentIndex = state.questions.length - 1;
    }

    const q = state.questions[state.currentIndex];
    state.visited[q.id] = true;

    if (DOM.badgeQuestionNumber) {
      DOM.badgeQuestionNumber.textContent = `Soal No. ${state.currentIndex + 1}`;
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

    if (DOM.questionText) {
      DOM.questionText.innerHTML = q.soal;
    }

    if (DOM.questionMedia) {
      if (q.media || q.image_data) {
        DOM.questionMedia.innerHTML = q.image_data || q.media;
        DOM.questionMedia.style.display = 'block';
      } else {
        DOM.questionMedia.innerHTML = '';
        DOM.questionMedia.style.display = 'none';
      }
    }

    renderOptions(q);

    if (DOM.checkboxRagu) DOM.checkboxRagu.checked = isRagu;
    if (DOM.btnRagu) DOM.btnRagu.classList.toggle('active', isRagu);

    if (DOM.btnPrev) {
      DOM.btnPrev.disabled = (state.currentIndex === 0);
    }
    if (DOM.btnMobilePrev) {
      DOM.btnMobilePrev.disabled = (state.currentIndex === 0);
    }
    if (DOM.mobileGridCounter) {
      DOM.mobileGridCounter.textContent = `${state.currentIndex + 1}/${state.questions.length}`;
    }
    if (DOM.btnMobileRagu) {
      DOM.btnMobileRagu.classList.toggle('active', !!state.ragu[q.id]);
    }
    if (DOM.btnNext) {
      if (state.currentIndex === state.questions.length - 1) {
        DOM.btnNext.querySelector('span').textContent = 'Simpan Jawaban';
      } else {
        DOM.btnNext.querySelector('span').textContent = 'Simpan & Lanjutkan';
      }
    }

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
      if (DOM.btnToggleStudyPembahasan) DOM.btnToggleStudyPembahasan.style.display = 'none';
      if (DOM.btnRetryQuestion) DOM.btnRetryQuestion.style.display = 'none';
      if (DOM.pembahasanBox) {
        DOM.pembahasanBox.classList.remove('visible');
        if (DOM.videoIframe) DOM.videoIframe.src = '';
      }
    }

    renderSidebar();
    saveActiveExamState();
  }

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

      if (isStudyFeedbackActive || isReviewMode) {
        label.classList.add('show-feedback');
        if (isKey) label.classList.add('is-correct-key');
        if (isSelected && !isKey && q.kategori !== 'TKP') label.classList.add('is-wrong-selection');
        if (isSelected && q.kategori === 'TKP' && weight < 5) label.classList.add('is-suboptimal');
      }

      if (isSelected) label.classList.add('selected');

      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = `skd_answer_${q.id}`;
      radio.value = key;
      radio.checked = isSelected;

      if (isReviewMode) radio.disabled = true;

      const indicator = document.createElement('span');
      indicator.className = 'option-indicator';
      indicator.textContent = key;

      const textDiv = document.createElement('div');
      textDiv.className = 'option-text';
      textDiv.innerHTML = optionText;

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

      label.addEventListener('click', () => {
        if (isReviewMode) return;
        selectOption(q, key);
      });

      DOM.optionsContainer.appendChild(label);
    });
  }

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

  function renderPembahasan(q, userChoice) {
    if (!DOM.pembahasanBox) return;

    if (DOM.kunciJawabanText) {
      if (q.kategori === 'TKP') {
        const bestOpt = ['A', 'B', 'C', 'D', 'E'].find(k => q.bobot[k] === 5) || q.kunci;
        DOM.kunciJawabanText.textContent = `${bestOpt} (Skor Tertinggi 5)`;
      } else {
        DOM.kunciJawabanText.textContent = q.kunci;
      }
    }

    if (DOM.rationaleMainContent) {
      DOM.rationaleMainContent.innerHTML = q.pembahasan;
    }

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

    if (DOM.tipsText) {
      DOM.tipsText.innerHTML = q.tips || 'Gunakan eliminasi opsi yang tidak logis dan perhatikan kata kunci pokok soal.';
    }

    if (DOM.videoSection) {
      if (q.video && q.video.url) {
        DOM.videoSection.style.display = 'block';
        const embedUrl = toYouTubeEmbedUrl(q.video.url, q.video.startSeconds);
        if (DOM.videoIframe) {
          DOM.videoIframe.referrerPolicy = 'strict-origin-when-cross-origin';
          DOM.videoIframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
          DOM.videoIframe.setAttribute('allowfullscreen', 'true');
          if (DOM.videoIframe.src !== embedUrl) {
            DOM.videoIframe.src = embedUrl;
          }
        }
        if (DOM.videoTitleText) {
          DOM.videoTitleText.textContent = q.video.title || `Video Pembahasan Soal No. ${q.id}`;
        }
        if (DOM.videoChannelText) {
          DOM.videoChannelText.textContent = 'Channel: ' + (q.video.channel || 'Edukasi CASN');
        }
        if (DOM.videoTimestampBadge) {
          if (q.video.startSeconds > 0 || q.video.timestamp) {
            const timeLabel = q.video.timestamp || formatTimestamp(q.video.startSeconds);
            const topicLabel = q.video.topic_part ? ` - ${q.video.topic_part}` : '';
            DOM.videoTimestampBadge.textContent = `⏱️ Langsung ke Pembahasan: Menit ${timeLabel}${topicLabel}`;
            DOM.videoTimestampBadge.style.display = 'inline-flex';
          } else {
            DOM.videoTimestampBadge.style.display = 'none';
          }
        }
        if (DOM.videoDirectLink) {
          const watchUrl = q.video.watchUrl || toYouTubeWatchUrl(q.video.url, q.video.startSeconds);
          DOM.videoDirectLink.href = watchUrl;
          const textSpan = DOM.videoDirectLink.querySelector('span');
          if (q.video.startSeconds > 0 || q.video.timestamp) {
            const timeLabel = q.video.timestamp || formatTimestamp(q.video.startSeconds);
            if (textSpan) textSpan.textContent = `Buka & Tonton Langsung pada Menit ${timeLabel} →`;
          } else {
            if (textSpan) textSpan.textContent = 'Buka & Tonton Langsung di YouTube →';
          }
        }
      } else {
        DOM.videoSection.style.display = 'none';
        if (DOM.videoIframe) DOM.videoIframe.src = '';
      }
    }

    if (DOM.sourceText) {
      DOM.sourceText.textContent = q.sumber || 'KepmenPAN-RB / FR Resmi CAT SKD';
    }
  }

  // --- 10. SIDEBAR & QUESTION GRID CONTROLLER ---

  function renderSidebar() {
    if (!state.questions || state.questions.length === 0) return;

    let answeredCount = 0;
    let raguCount = 0;
    let unansweredCount = 0;

    state.questions.forEach(q => {
      const hasAnswer = !!state.answers[q.id];
      const hasRagu = !!state.ragu[q.id];

      if (hasRagu) raguCount++;
      else if (hasAnswer) answeredCount++;
      else unansweredCount++;
    });

    const totalQuestions = state.questions.length;

    if (DOM.statAnswered) DOM.statAnswered.textContent = answeredCount;
    if (DOM.statRagu) DOM.statRagu.textContent = raguCount;
    if (DOM.statUnanswered) DOM.statUnanswered.textContent = unansweredCount;
    if (DOM.statTotal) DOM.statTotal.textContent = totalQuestions;

    if (DOM.progressBarFill) {
      const pct = Math.round(((answeredCount + raguCount) / totalQuestions) * 100);
      DOM.progressBarFill.style.width = `${pct}%`;
    }

    if (DOM.legendCountAnswered) DOM.legendCountAnswered.textContent = `(${answeredCount})`;
    if (DOM.legendCountRagu) DOM.legendCountRagu.textContent = `(${raguCount})`;
    if (DOM.legendCountUnanswered) DOM.legendCountUnanswered.textContent = `(${unansweredCount})`;

    const twkCount = state.questions.filter(q => q.kategori === 'TWK').length;
    const tiuCount = state.questions.filter(q => q.kategori === 'TIU').length;
    const tkpCount = state.questions.filter(q => q.kategori === 'TKP').length;

    if (DOM.countFilterAll) DOM.countFilterAll.textContent = totalQuestions;
    if (DOM.countFilterTwk) DOM.countFilterTwk.textContent = twkCount;
    if (DOM.countFilterTiu) DOM.countFilterTiu.textContent = tiuCount;
    if (DOM.countFilterTkp) DOM.countFilterTkp.textContent = tkpCount;

    renderGridButtons();
  }

  function renderGridButtons() {
    if (!DOM.questionGrid) return;
    DOM.questionGrid.innerHTML = '';

    state.questions.forEach((q, idx) => {
      if (state.gridRangeFilter !== 'all' && q.kategori !== state.gridRangeFilter) {
        return;
      }

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'grid-btn';
      btn.textContent = idx + 1;
      btn.setAttribute('data-index', idx);
      btn.setAttribute('aria-label', `Soal No. ${idx + 1} - ${q.kategori}`);

      const hasAnswer = !!state.answers[q.id];
      const hasRagu = !!state.ragu[q.id];
      const isCurrent = (idx === state.currentIndex);

      if (hasRagu) btn.classList.add('ragu');
      else if (hasAnswer) btn.classList.add('answered');
      else btn.classList.add('unanswered');

      if (isCurrent) btn.classList.add('current');

      btn.addEventListener('click', () => {
        state.currentIndex = idx;
        if (state.mode === 'review' && DOM.reviewSessionView && DOM.reviewSessionView.classList.contains('active')) {
          DOM.reviewSessionView.classList.remove('active');
          DOM.questionCard.style.display = 'block';
        }
        renderCurrentQuestion();
        closeMobileDrawer();
      });

      DOM.questionGrid.appendChild(btn);
    });
  }

  // --- 11. POST-EXAM REVIEW SESI VIEW ---

  function renderReviewSessionView() {
    if (!DOM.reviewQuestionsList) return;
    DOM.reviewQuestionsList.innerHTML = '';

    const results = calculateScores();

    const wrongCount = results.detailedList.filter(item => !item.isCorrect).length;
    const correctCount = results.detailedList.filter(item => item.isCorrect).length;
    const raguCount = results.detailedList.filter(item => item.isRagu).length;
    const twkCount = results.detailedList.filter(item => item.question.kategori === 'TWK').length;
    const tiuCount = results.detailedList.filter(item => item.question.kategori === 'TIU').length;
    const tkpCount = results.detailedList.filter(item => item.question.kategori === 'TKP').length;

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

    const filtered = results.detailedList.filter(item => {
      const q = item.question;
      switch (state.reviewFilter) {
        case 'wrong': return !item.isCorrect;
        case 'correct': return item.isCorrect;
        case 'ragu': return item.isRagu;
        case 'TWK': return q.kategori === 'TWK';
        case 'TIU': return q.kategori === 'TIU';
        case 'TKP': return q.kategori === 'TKP';
        case 'all':
        default: return true;
      }
    });

    if (filtered.length === 0) {
      DOM.reviewQuestionsList.innerHTML = `
        <div style="text-align:center; padding:3rem 1rem; color:var(--text-muted); background:#ffffff; border-radius:var(--radius-md); border:1px solid var(--border-color);">
          <h4 style="margin:0 0 0.25rem 0; font-size:1.05rem;">Tidak ada butir soal dalam filter ini</h4>
          <p style="margin:0; font-size:0.875rem;">Silakan pilih filter lain di atas untuk meninjau soal lainnya.</p>
        </div>
      `;
      return;
    }

    filtered.forEach((item, fIdx) => {
      const q = item.question;
      const userChoice = item.userChoice;
      const isCorrect = item.isCorrect;

      const card = document.createElement('article');
      card.className = 'review-card';

      if (item.isRagu) card.classList.add('status-ragu');
      else if (!userChoice) card.classList.add('status-unanswered');
      else if (isCorrect) card.classList.add('status-correct');
      else card.classList.add('status-wrong');

      let resultBadgeHtml = '';
      if (!userChoice) {
        resultBadgeHtml = `<span class="review-user-result-badge unanswered">Kosong (0 Poin)</span>`;
      } else if (q.kategori === 'TKP') {
        resultBadgeHtml = `<span class="review-user-result-badge ${item.scoreEarned === 5 ? 'correct' : 'wrong'}">Pilihan Anda: Opsi ${userChoice} (Skor: ${item.scoreEarned})</span>`;
      } else if (isCorrect) {
        resultBadgeHtml = `<span class="review-user-result-badge correct">Benar: Opsi ${userChoice} (+5 Poin)</span>`;
      } else {
        resultBadgeHtml = `<span class="review-user-result-badge wrong">Salah: Opsi ${userChoice} (Kunci: ${q.kunci}) (0 Poin)</span>`;
      }

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

      let videoHtml = '';
      if (q.video && q.video.url) {
        const embedUrl = toYouTubeEmbedUrl(q.video.url);
        const watchUrl = q.video.watchUrl || toYouTubeWatchUrl(q.video.url);
        const vidTitle = escapeHTML(q.video.title || `Video Pembahasan Soal No. ${q.id}`);
        const vidChannel = escapeHTML(q.video.channel || 'Edukasi CASN');

        const tsLabel = (q.video && q.video.timestamp) ? q.video.timestamp : '';
        const topicLabel = (q.video && q.video.topic_part) ? ` - ${escapeHTML(q.video.topic_part)}` : '';
        const timestampBadgeHtml = tsLabel ? `<span class="video-timestamp-badge" style="display:inline-flex; margin-top:4px;">⏱️ Langsung ke Pembahasan: Menit ${escapeHTML(tsLabel)}${topicLabel}</span>` : '';
        const buttonText = tsLabel ? `Buka & Tonton Langsung pada Menit ${escapeHTML(tsLabel)} &rarr;` : `Buka & Tonton Langsung di YouTube &rarr;`;

        videoHtml = `
          <div class="video-explainer-card" style="margin-top:0.75rem;">
            <div class="video-header">
              <div class="video-title-wrap">
                <span class="video-badge">YOUTUBE PEMBAHASAN</span>
                <span class="video-title">${vidTitle}</span>
                ${timestampBadgeHtml}
              </div>
              <span class="video-channel-tag" style="font-size:0.75rem; color:#cbd5e1; font-weight:600;">Channel: ${vidChannel}</span>
            </div>
            <div class="video-embed-container">
              <iframe
                src="${embedUrl}"
                title="${vidTitle}"
                referrerpolicy="strict-origin-when-cross-origin"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowfullscreen
                loading="lazy">
              </iframe>
            </div>
            <div class="video-actions-bar">
              <a href="${watchUrl}" target="_blank" rel="noopener noreferrer" class="btn-watch-youtube">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                </svg>
                <span>${buttonText}</span>
              </a>
            </div>
            <div class="video-tip-notice">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="16" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12.01" y2="8"></line>
              </svg>
              <span><strong>Tips:</strong> Jika YouTube player menampilkan "Error 153" di browser saat offline file://, gunakan tombol di atas untuk menonton langsung di tab baru.</span>
            </div>
          </div>
        `;
      }

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
            <span class="badge-question-number">Soal No. ${item.index + 1}</span>
            <span class="badge-question-category">${escapeHTML(q.kategori)} - ${escapeHTML(q.subkategori)}</span>
          </div>
          <div>${resultBadgeHtml}</div>
        </header>

        <div class="review-card-body">
          <div class="review-question-text">${q.soal}</div>
          ${(q.media || q.image_data) ? `<div class="question-media-wrapper" style="margin-bottom:0.75rem;">${q.image_data || q.media}</div>` : ''}
          <div class="review-options-grid">${optionsHtml}</div>

          <div class="review-pembahasan-box">
            <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:0.5rem; border-bottom:1px solid var(--border-color); padding-bottom:0.5rem;">
              <strong style="color:var(--cat-primary); font-size:0.95rem;">Pembahasan & Analisis Resmi:</strong>
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

  // --- 12. FINISH EXAM & AUTO SAVE TO SQLITE ---

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
      DOM.confirmUnansweredWarning.style.display = (unanswered > 0 || ragu > 0) ? 'flex' : 'none';
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

    if (DOM.scoreValTwk) DOM.scoreValTwk.textContent = results.twkScore;
    if (DOM.scoreValTiu) DOM.scoreValTiu.textContent = results.tiuScore;
    if (DOM.scoreValTkp) DOM.scoreValTkp.textContent = results.tkpScore;
    if (DOM.scoreValTotal) DOM.scoreValTotal.textContent = results.totalScore;

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
          `Nilai Anda memenuhi seluruh passing grade PermenPAN-RB (TWK: ${results.twkScore}/${CONFIG.PASSING_GRADES.TWK}, TIU: ${results.tiuScore}/${CONFIG.PASSING_GRADES.TIU}, TKP: ${results.tkpScore}/${CONFIG.PASSING_GRADES.TKP}). Berpeluang besar lolos ke tahapan SKB!`;
      } else {
        const failedAreas = [];
        if (!results.passTWK) failedAreas.push(`TWK (${results.twkScore} < ${CONFIG.PASSING_GRADES.TWK})`);
        if (!results.passTIU) failedAreas.push(`TIU (${results.tiuScore} < ${CONFIG.PASSING_GRADES.TIU})`);
        if (!results.passTKP) failedAreas.push(`TKP (${results.tkpScore} < ${CONFIG.PASSING_GRADES.TKP})`);

        DOM.finalStatusDesc.textContent =
          `Peserta dinyatakan BELUM MEMENUHI karena perolehan nilai pada sub-tes berikut masih di bawah passing grade: ${failedAreas.join(', ')}.`;
      }
    }

    if (DOM.certExamDate) {
      DOM.certExamDate.textContent = formatIndonesianDate();
    }
    const timeSpentSec = Math.max(0, CONFIG.EXAM_DURATION_SECONDS - state.timeRemaining);
    if (DOM.certExamDuration) {
      const spentMin = Math.ceil(timeSpentSec / 60);
      DOM.certExamDuration.textContent = `${spentMin} Menit (${timeSpentSec} detik)`;
    }

    if (DOM.modalResult) {
      DOM.modalResult.classList.add('open');
    }

    if (DOM.tabModeReview) {
      DOM.tabModeReview.style.display = 'inline-flex';
    }

    saveSessionToSQLite({
      session_name: `Simulasi CAT SKD - ${formatIndonesianDate()}`,
      mode: 'simulasi',
      duration_seconds: timeSpentSec,
      twk_score: results.twkScore,
      tiu_score: results.tiuScore,
      tkp_score: results.tkpScore,
      total_score: results.totalScore,
      pass_twk: results.passTWK ? 1 : 0,
      pass_tiu: results.passTIU ? 1 : 0,
      pass_tkp: results.passTKP ? 1 : 0,
      pass_total: results.passTotal ? 1 : 0,
      total_answered: results.answeredCount,
      total_questions: state.questions.length,
      answers: state.answers,
      results: results.detailedList.map(item => ({
        id: item.question.id,
        userChoice: item.userChoice,
        scoreEarned: item.scoreEarned,
        isCorrect: item.isCorrect,
        isRagu: item.isRagu
      }))
    });

    saveActiveExamState();
  }

  // ==========================================================================
  // --- 13. CLIENT-SIDE SQLITE ENGINE (sql.js WebAssembly & IndexedDB) ---
  // ==========================================================================

  let sqliteDB = null;
  let isSQLiteReady = false;

  function openIndexedDB() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        return reject(new Error('Browser tidak mendukung IndexedDB'));
      }
      const req = window.indexedDB.open(CONFIG.IDB_NAME, 1);
      req.onupgradeneeded = (e) => {
        const idb = e.target.result;
        if (!idb.objectStoreNames.contains(CONFIG.IDB_STORE)) {
          idb.createObjectStore(CONFIG.IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function getStoredSQLiteBinary() {
    try {
      const idb = await openIndexedDB();
      return new Promise((resolve) => {
        const tx = idb.transaction(CONFIG.IDB_STORE, 'readonly');
        const store = tx.objectStore(CONFIG.IDB_STORE);
        const req = store.get(CONFIG.IDB_KEY);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    } catch (e) {
      return null;
    }
  }

  async function saveStoredSQLiteBinary(uint8Array) {
    try {
      const idb = await openIndexedDB();
      return new Promise((resolve, reject) => {
        const tx = idb.transaction(CONFIG.IDB_STORE, 'readwrite');
        const store = tx.objectStore(CONFIG.IDB_STORE);
        const req = store.put(uint8Array, CONFIG.IDB_KEY);
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      return false;
    }
  }

  async function persistSQLiteDB() {
    if (!sqliteDB) return false;
    try {
      const binary = sqliteDB.export();
      await saveStoredSQLiteBinary(binary);
      return true;
    } catch (e) {
      return false;
    }
  }

  async function ensureSqlJsLoaded() {
    if (typeof window.initSqlJs === 'function') {
      return window.initSqlJs;
    }
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.12.0/sql-wasm.js';
      script.onload = () => {
        if (typeof window.initSqlJs === 'function') {
          resolve(window.initSqlJs);
        } else {
          reject(new Error('initSqlJs tidak ditemukan setelah script dimuat'));
        }
      };
      script.onerror = () => reject(new Error('Gagal memuat sql-wasm.js dari CDN'));
      document.head.appendChild(script);
    });
  }

  function createTablesIfNotExist(db) {
    db.run(`
      CREATE TABLE IF NOT EXISTS exam_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_name TEXT,
        mode TEXT,
        duration_seconds INTEGER DEFAULT 0,
        twk_score INTEGER DEFAULT 0,
        tiu_score INTEGER DEFAULT 0,
        tkp_score INTEGER DEFAULT 0,
        total_score INTEGER DEFAULT 0,
        pass_twk INTEGER DEFAULT 0,
        pass_tiu INTEGER DEFAULT 0,
        pass_tkp INTEGER DEFAULT 0,
        pass_total INTEGER DEFAULT 0,
        total_answered INTEGER DEFAULT 0,
        total_questions INTEGER DEFAULT 110,
        answers_json TEXT,
        results_json TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_created ON exam_sessions(created_at DESC);

      CREATE TABLE IF NOT EXISTS questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kategori TEXT NOT NULL,
        subkategori TEXT,
        soal TEXT NOT NULL,
        opsi_a TEXT,
        opsi_b TEXT,
        opsi_c TEXT,
        opsi_d TEXT,
        opsi_e TEXT,
        bobot_a INTEGER DEFAULT 0,
        bobot_b INTEGER DEFAULT 0,
        bobot_c INTEGER DEFAULT 0,
        bobot_d INTEGER DEFAULT 0,
        bobot_e INTEGER DEFAULT 0,
        kunci TEXT NOT NULL,
        has_image INTEGER DEFAULT 0,
        image_data TEXT,
        sumber_nama TEXT,
        sumber_url TEXT,
        sumber_halaman TEXT,
        sumber_no_soal TEXT,
        pembahasan TEXT,
        analisis_a TEXT,
        analisis_b TEXT,
        analisis_c TEXT,
        analisis_d TEXT,
        analisis_e TEXT,
        tips TEXT,
        video_url TEXT,
        video_title TEXT,
        video_channel TEXT,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_questions_kategori ON questions(kategori);
      CREATE INDEX IF NOT EXISTS idx_questions_active ON questions(is_active);
    `);
  }

  function loadFallbackQuestionsScript() {
    if (Array.isArray(window.SKD_QUESTIONS) && window.SKD_QUESTIONS.length > 0) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const existing = document.querySelector('script[src*="data/questions.js"]');
      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => resolve(), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = 'data/questions.js?v=20261126';
      script.onload = () => resolve();
      script.onerror = () => resolve();
      document.head.appendChild(script);
    });
  }

  async function seedQuestionsIfEmpty(db) {
    try {
      const res = db.exec("SELECT COUNT(*) AS cnt FROM questions;");
      const count = (res.length > 0 && res[0].values.length > 0) ? res[0].values[0][0] : 0;
      if (count > 0) {
        return;
      }
    } catch (e) {
    }

    await loadFallbackQuestionsScript();
    const list = window.SKD_QUESTIONS || [];
    if (!Array.isArray(list) || list.length === 0) {
      return;
    }

    db.run("BEGIN TRANSACTION;");
    const stmt = db.prepare(`
      INSERT INTO questions (
        id, kategori, subkategori, soal,
        opsi_a, opsi_b, opsi_c, opsi_d, opsi_e,
        bobot_a, bobot_b, bobot_c, bobot_d, bobot_e,
        kunci, has_image, image_data,
        sumber_nama, sumber_url, sumber_halaman, sumber_no_soal,
        pembahasan,
        analisis_a, analisis_b, analisis_c, analisis_d, analisis_e,
        tips, video_url, video_title, video_channel,
        is_active
      ) VALUES (
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        1
      );
    `);

    list.forEach((q, idx) => {
      const id = q.id || (idx + 1);
      const kategori = (q.kategori || 'TWK').toUpperCase();
      const subkategori = q.subkategori || '';
      const soal = q.soal || '';
      const opsi = q.opsi || {};
      const bobot = q.bobot || {};
      const kunci = (q.kunci || 'A').toUpperCase();
      const hasImage = (q.has_image || q.gambar || q.media) ? 1 : 0;
      const imageData = q.gambar || q.media || q.image_data || null;

      const sumberNama = q.sumber_nama || q.sumber || 'KepmenPAN-RB No. 674 Tahun 2026';
      const sumberUrl = q.sumber_url || 'https://menpan.go.id';
      const sumberHalaman = q.sumber_halaman || 'Lampiran Materi';
      const sumberNoSoal = q.sumber_no_soal || `Butir ${id}`;

      const pembahasan = q.pembahasan || '';
      const analisis = q.analisis_opsi || {};
      const tips = q.tips || '';

      let videoUrl = null;
      let videoTitle = null;
      let videoChannel = null;

      if (q.youtube && typeof q.youtube === 'object') {
        videoUrl = q.youtube.url || null;
        videoTitle = q.youtube.title || null;
        videoChannel = q.youtube.channel || null;
      } else if (q.video && typeof q.video === 'object') {
        videoUrl = q.video.url || null;
        videoTitle = q.video.title || null;
        videoChannel = q.video.channel || null;
      } else if (q.video_url) {
        videoUrl = q.video_url;
        videoTitle = q.video_title || null;
        videoChannel = q.video_channel || null;
      }

      stmt.run([
        id, kategori, subkategori, soal,
        opsi['A'] || '', opsi['B'] || '', opsi['C'] || '', opsi['D'] || '', opsi['E'] || '',
        bobot['A'] ?? 0, bobot['B'] ?? 0, bobot['C'] ?? 0, bobot['D'] ?? 0, bobot['E'] ?? 0,
        kunci, hasImage, imageData,
        sumberNama, sumberUrl, sumberHalaman, sumberNoSoal,
        pembahasan,
        analisis['A'] || '', analisis['B'] || '', analisis['C'] || '', analisis['D'] || '', analisis['E'] || '',
        tips, videoUrl, videoTitle, videoChannel
      ]);
    });

    stmt.free();
    db.run("COMMIT;");
  }

  async function initSQLiteEngine() {
    try {
      if (DOM.sqliteStatusBadge) {
        DOM.sqliteStatusBadge.innerHTML = '<span class="sqlite-badge-dot"></span><span>Memuat SQLite WASM...</span>';
      }

      const initSql = await ensureSqlJsLoaded();
      
      const SQL = await initSql({
        locateFile: (file) => {
          if (file.endsWith('.wasm')) {
            if (window.location.protocol === 'file:') {
              return 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.12.0/' + file;
            }
            return 'js/' + file;
          }
          return file;
        }
      });

      // 1. Cek versi data dan IndexedDB
      const DATA_VERSION = 'v7_kepmenpan674_2026';
      const storedVer = localStorage.getItem('CAT_DB_DATA_VERSION');
      let binary = null;

      if (storedVer === DATA_VERSION) {
        binary = await getStoredSQLiteBinary();
      } else {
      }

      // 2. Jika belum ada atau versi baru, muat dari file database.sqlite via fetch
      if (!binary) {
        try {
          const resp = await fetch('database.sqlite');
          if (resp.ok) {
            const buffer = await resp.arrayBuffer();
            if (buffer && buffer.byteLength > 0) {
              binary = new Uint8Array(buffer);
            }
          }
        } catch (fetchErr) {
        }
      }

      // 3. Buat database instance
      if (binary && binary.byteLength > 0) {
        sqliteDB = new SQL.Database(binary);
      } else {
        sqliteDB = new SQL.Database();
      }

      // 4. Pastikan tabel tersedia & seed jika kosong
      createTablesIfNotExist(sqliteDB);
      await seedQuestionsIfEmpty(sqliteDB);

      // 5. Simpan binary terkini ke IndexedDB & catat versi data
      await persistSQLiteDB();
      localStorage.setItem('CAT_DB_DATA_VERSION', DATA_VERSION);

      isSQLiteReady = true;
      window.sqliteDB = sqliteDB;
      window.SQLiteJS = {
        db: sqliteDB,
        isReady: true,
        exportBinary: () => sqliteDB ? sqliteDB.export() : null,
        queryRows,
        queryOne
      };
      if (DOM.sqliteStatusBadge) {
        DOM.sqliteStatusBadge.innerHTML = '<span class="sqlite-badge-dot" style="background:#10b981;"></span><span>SQLite JS (WASM)</span>';
      }
      return sqliteDB;
    } catch (e) {
      if (DOM.sqliteStatusBadge) {
        DOM.sqliteStatusBadge.innerHTML = '<span class="sqlite-badge-dot" style="background:#f59e0b;"></span><span>SQLite Fallback (In-Memory)</span>';
      }
      return null;
    }
  }

  function queryRows(sql, params = []) {
    if (!sqliteDB) return [];
    try {
      const stmt = sqliteDB.prepare(sql);
      stmt.bind(params);
      const rows = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject());
      }
      stmt.free();
      return rows;
    } catch (e) {
      return [];
    }
  }

  function queryOne(sql, params = []) {
    const rows = queryRows(sql, params);
    return rows.length > 0 ? rows[0] : null;
  }

  function formatQuestionRow(r) {
    const id = Number(r.id);
    return {
      id: id,
      no: id,
      kategori: r.kategori,
      subkategori: r.subkategori,
      soal: r.soal,
      opsi: {
        A: r.opsi_a || '',
        B: r.opsi_b || '',
        C: r.opsi_c || '',
        D: r.opsi_d || '',
        E: r.opsi_e || ''
      },
      bobot: {
        A: Number(r.bobot_a || 0),
        B: Number(r.bobot_b || 0),
        C: Number(r.bobot_c || 0),
        D: Number(r.bobot_d || 0),
        E: Number(r.bobot_e || 0)
      },
      kunci: r.kunci,
      has_image: Number(r.has_image || 0),
      image_data: r.image_data || '',
      media: r.image_data || '',
      gambar: r.image_data || '',
      sumber_nama: r.sumber_nama || '',
      sumber_url: r.sumber_url || '',
      sumber_halaman: r.sumber_halaman || '',
      sumber_no_soal: r.sumber_no_soal || '',
      sumber: r.sumber_nama ? (r.sumber_nama + (r.sumber_halaman ? ` (Hal: ${r.sumber_halaman})` : '')) : 'KepmenPAN-RB',
      pembahasan: r.pembahasan || '',
      analisis_opsi: {
        A: r.analisis_a || '',
        B: r.analisis_b || '',
        C: r.analisis_c || '',
        D: r.analisis_d || '',
        E: r.analisis_e || ''
      },
      tips: r.tips || '',
      video: r.video_url ? {
        url: toYouTubeEmbedUrl(r.video_url, extractYouTubeStartSeconds(r.video_url)),
        watchUrl: toYouTubeWatchUrl(r.video_url, extractYouTubeStartSeconds(r.video_url)),
        title: r.video_title || `Video Pembahasan Soal #${id}`,
        channel: r.video_channel || 'Edukasi CASN BKN',
        startSeconds: extractYouTubeStartSeconds(r.video_url),
        timestamp: formatTimestamp(extractYouTubeStartSeconds(r.video_url))
      } : null,
      is_active: Number(r.is_active !== undefined && r.is_active !== null ? r.is_active : 1),
      created_at: r.created_at,
      updated_at: r.updated_at
    };
  }

  function exportDatabaseFile() {
    if (!sqliteDB) {
      alert('Database SQLite belum siap.');
      return;
    }
    try {
      const binary = sqliteDB.export();
      const blob = new Blob([binary], { type: 'application/x-sqlite3' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'database.sqlite';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      alert('Gagal mengekspor file database.sqlite: ' + e.message);
    }
  }

  async function importDatabaseFile(file) {
    if (!file) return;
    try {
      const buffer = await file.arrayBuffer();
      const binary = new Uint8Array(buffer);
      const initSql = await ensureSqlJsLoaded();
      const SQL = await initSql({
        locateFile: (f) => (window.location.protocol === 'file:' ? 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.12.0/' : 'js/') + f
      });

      const newDb = new SQL.Database(binary);
      // Validasi tabel questions
      const res = newDb.exec("SELECT COUNT(*) AS cnt FROM questions;");
      if (!res || res.length === 0) {
        throw new Error('File SQLite tidak memiliki tabel questions yang valid.');
      }

      sqliteDB = newDb;
      createTablesIfNotExist(sqliteDB);
      await persistSQLiteDB();
      await loadActiveQuestions();

      if (state.currentScreen === 'bank-soal') {
        await loadAndRenderBankSoal();
      } else if (state.currentScreen === 'history') {
        await loadAndRenderHistory();
      }

      alert(`Database SQLite berhasil diimpor! Total ${res[0].values[0][0]} butir soal berhasil dimuat.`);
    } catch (e) {
      alert('Gagal mengimpor file SQLite: ' + e.message);
    }
  }

  // --- SESSIONS SQLITE OPERATIONS (PURE JS) ---

  async function saveSessionToSQLite(sessionData) {
    if (sqliteDB) {
      try {
        const answersJson = JSON.stringify(sessionData.answers || {});
        const resultsJson = JSON.stringify(sessionData.results || {});
        const sessionName = sessionData.session_name || `Simulasi CAT ${new Date().toLocaleDateString('id-ID')}`;
        const mode = sessionData.mode || 'simulasi';
        const duration = sessionData.duration_seconds || 0;
        const twkScore = sessionData.twk_score || 0;
        const tiuScore = sessionData.tiu_score || 0;
        const tkpScore = sessionData.tkp_score || 0;
        const totalScore = sessionData.total_score || 0;
        const passTwk = sessionData.pass_twk ? 1 : 0;
        const passTiu = sessionData.pass_tiu ? 1 : 0;
        const passTkp = sessionData.pass_tkp ? 1 : 0;
        const passTotal = sessionData.pass_total ? 1 : 0;
        const totalAnswered = sessionData.total_answered || 0;
        const totalQuestions = sessionData.total_questions || 110;

        const stmt = sqliteDB.prepare(`
          INSERT INTO exam_sessions (
            session_name, mode, duration_seconds,
            twk_score, tiu_score, tkp_score, total_score,
            pass_twk, pass_tiu, pass_tkp, pass_total,
            total_answered, total_questions,
            answers_json, results_json,
            created_at
          ) VALUES (
            ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?,
            ?, ?,
            datetime('now', 'localtime')
          );
        `);
        stmt.run([
          sessionName, mode, duration,
          twkScore, tiuScore, tkpScore, totalScore,
          passTwk, passTiu, passTkp, passTotal,
          totalAnswered, totalQuestions,
          answersJson, resultsJson
        ]);
        stmt.free();

        const lastIdRes = sqliteDB.exec("SELECT last_insert_rowid() AS id;");
        const newId = (lastIdRes.length > 0 && lastIdRes[0].values.length > 0) ? lastIdRes[0].values[0][0] : Date.now();

        await persistSQLiteDB();
        state.activeSessionId = newId;
        return newId;
      } catch (e) {
      }
    }

    // Fallback: localStorage
    try {
      const raw = localStorage.getItem(CONFIG.HISTORY_FALLBACK_KEY);
      const list = raw ? JSON.parse(raw) : [];
      const newId = list.length > 0 ? Math.max(...list.map(s => s.id || 0)) + 1 : 1;
      const record = {
        id: newId,
        ...sessionData,
        created_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
      };
      list.unshift(record);
      localStorage.setItem(CONFIG.HISTORY_FALLBACK_KEY, JSON.stringify(list));
      state.activeSessionId = newId;
      return newId;
    } catch (err) {
      return null;
    }
  }

  async function fetchHistoryFromSQLite() {
    if (sqliteDB) {
      try {
        const rows = queryRows("SELECT * FROM exam_sessions ORDER BY created_at DESC;");
        return rows;
      } catch (e) {
      }
    }

    try {
      const raw = localStorage.getItem(CONFIG.HISTORY_FALLBACK_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  async function deleteSessionFromSQLite(id) {
    if (sqliteDB) {
      try {
        const stmt = sqliteDB.prepare("DELETE FROM exam_sessions WHERE id = ?;");
        stmt.run([id]);
        stmt.free();
        await persistSQLiteDB();
        return true;
      } catch (e) {
      }
    }

    try {
      const raw = localStorage.getItem(CONFIG.HISTORY_FALLBACK_KEY);
      if (raw) {
        let list = JSON.parse(raw);
        list = list.filter(item => item.id !== id);
        localStorage.setItem(CONFIG.HISTORY_FALLBACK_KEY, JSON.stringify(list));
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  async function resetAllHistoryInSQLite() {
    if (sqliteDB) {
      try {
        sqliteDB.run("DELETE FROM exam_sessions; DELETE FROM sqlite_sequence WHERE name='exam_sessions';");
        await persistSQLiteDB();
        return true;
      } catch (e) {
      }
    }

    try {
      localStorage.removeItem(CONFIG.HISTORY_FALLBACK_KEY);
      return true;
    } catch (e) {
      return false;
    }
  }

  async function getSessionDetailFromSQLite(id) {
    if (sqliteDB) {
      try {
        const r = queryOne("SELECT * FROM exam_sessions WHERE id = ?;", [id]);
        if (r) {
          let answers = {};
          let results = null;
          try { answers = JSON.parse(r.answers_json || '{}'); } catch (e) {}
          try { results = JSON.parse(r.results_json || 'null'); } catch (e) {}
          return {
            id: r.id,
            session_name: r.session_name,
            mode: r.mode,
            duration_seconds: r.duration_seconds,
            twk_score: r.twk_score,
            tiu_score: r.tiu_score,
            tkp_score: r.tkp_score,
            total_score: r.total_score,
            pass_twk: r.pass_twk,
            pass_tiu: r.pass_tiu,
            pass_tkp: r.pass_tkp,
            pass_total: r.pass_total,
            total_answered: r.total_answered,
            total_questions: r.total_questions,
            answers: answers,
            results: results,
            created_at: r.created_at
          };
        }
      } catch (e) {
      }
    }

    try {
      const raw = localStorage.getItem(CONFIG.HISTORY_FALLBACK_KEY);
      if (raw) {
        const list = JSON.parse(raw);
        return list.find(item => item.id === id) || null;
      }
    } catch (e) {}
    return null;
  }

  // --- 14. BANK SOAL SQLITE CRUD OPERATIONS (PURE JS) ---

  async function fetchBankSoalFromSQLite() {
    if (sqliteDB) {
      try {
        let sql = "SELECT * FROM questions WHERE 1=1";
        const params = [];

        if (state.bankFilterCat && state.bankFilterCat !== 'all') {
          sql += " AND kategori = ?";
          params.push(state.bankFilterCat.toUpperCase());
        }

        if (state.bankFilterStatus && state.bankFilterStatus !== 'all') {
          sql += " AND is_active = ?";
          params.push(state.bankFilterStatus === 'active' ? 1 : 0);
        }

        if (state.bankSearchQuery) {
          sql += " AND (soal LIKE ? OR subkategori LIKE ? OR sumber_nama LIKE ?)";
          const term = `%${state.bankSearchQuery}%`;
          params.push(term, term, term);
        }

        sql += " ORDER BY id ASC;";

        const rows = queryRows(sql, params);
        return rows.map(r => formatQuestionRow(r));
      } catch (e) {
      }
    }

    // Fallback: window.SKD_QUESTIONS
    let fallbackList = (window.SKD_QUESTIONS || []).map((q, idx) => normalizeQuestion(q, idx));
    if (state.bankFilterCat && state.bankFilterCat !== 'all') {
      fallbackList = fallbackList.filter(q => q.kategori === state.bankFilterCat);
    }
    if (state.bankFilterStatus && state.bankFilterStatus !== 'all') {
      const isActiveFilter = state.bankFilterStatus === 'active';
      fallbackList = fallbackList.filter(q => (q.is_active ? true : false) === isActiveFilter);
    }
    if (state.bankSearchQuery) {
      const qLower = state.bankSearchQuery.toLowerCase();
      fallbackList = fallbackList.filter(q => 
        (q.soal && q.soal.toLowerCase().includes(qLower)) ||
        (q.subkategori && q.subkategori.toLowerCase().includes(qLower)) ||
        (q.sumber_nama && q.sumber_nama.toLowerCase().includes(qLower))
      );
    }
    return fallbackList;
  }

  async function toggleQuestionStatusSQLite(id, isActive) {
    if (sqliteDB) {
      try {
        const stmt = sqliteDB.prepare("UPDATE questions SET is_active = ?, updated_at = datetime('now', 'localtime') WHERE id = ?;");
        stmt.run([isActive ? 1 : 0, id]);
        stmt.free();
        await persistSQLiteDB();
        await loadActiveQuestions();
        return true;
      } catch (e) {
      }
    }

    // Fallback in-memory
    const inMem = (window.SKD_QUESTIONS || []).find(q => q.id === id);
    if (inMem) inMem.is_active = isActive ? 1 : 0;
    await loadActiveQuestions();
    return true;
  }

  async function saveQuestionToSQLite(questionPayload) {
    if (sqliteDB) {
      try {
        const id = parseInt(questionPayload.id || 0, 10);
        const kategori = (questionPayload.kategori || 'TWK').toUpperCase();
        const subkategori = questionPayload.subkategori || '';
        const soal = questionPayload.soal || '';
        const opsi = questionPayload.opsi || {};
        const bobot = questionPayload.bobot || {};
        const kunci = (questionPayload.kunci || 'A').toUpperCase();
        const hasImage = questionPayload.has_image ? 1 : 0;
        const imageData = questionPayload.image_data || '';
        const sumberNama = questionPayload.sumber_nama || '';
        const sumberUrl = questionPayload.sumber_url || '';
        const sumberHalaman = questionPayload.sumber_halaman || '';
        const sumberNo = questionPayload.sumber_no_soal || '';
        const pembahasan = questionPayload.pembahasan || '';
        const analisis = questionPayload.analisis_opsi || {};
        const tips = questionPayload.tips || '';
        const videoUrl = questionPayload.video_url || '';
        const videoTitle = questionPayload.video_title || '';
        const videoChannel = questionPayload.video_channel || '';
        const isActive = questionPayload.is_active ? 1 : 0;

        if (id > 0) {
          // Update
          const stmt = sqliteDB.prepare(`
            UPDATE questions SET
              kategori = ?, subkategori = ?, soal = ?,
              opsi_a = ?, opsi_b = ?, opsi_c = ?, opsi_d = ?, opsi_e = ?,
              bobot_a = ?, bobot_b = ?, bobot_c = ?, bobot_d = ?, bobot_e = ?,
              kunci = ?, has_image = ?, image_data = ?,
              sumber_nama = ?, sumber_url = ?, sumber_halaman = ?, sumber_no_soal = ?,
              pembahasan = ?,
              analisis_a = ?, analisis_b = ?, analisis_c = ?, analisis_d = ?, analisis_e = ?,
              tips = ?, video_url = ?, video_title = ?, video_channel = ?,
              is_active = ?, updated_at = datetime('now', 'localtime')
            WHERE id = ?;
          `);
          stmt.run([
            kategori, subkategori, soal,
            opsi['A'] || '', opsi['B'] || '', opsi['C'] || '', opsi['D'] || '', opsi['E'] || '',
            bobot['A'] ?? 0, bobot['B'] ?? 0, bobot['C'] ?? 0, bobot['D'] ?? 0, bobot['E'] ?? 0,
            kunci, hasImage, imageData,
            sumberNama, sumberUrl, sumberHalaman, sumberNo,
            pembahasan,
            analisis['A'] || '', analisis['B'] || '', analisis['C'] || '', analisis['D'] || '', analisis['E'] || '',
            tips, videoUrl, videoTitle, videoChannel,
            isActive, id
          ]);
          stmt.free();
        } else {
          // Insert
          const stmt = sqliteDB.prepare(`
            INSERT INTO questions (
              kategori, subkategori, soal,
              opsi_a, opsi_b, opsi_c, opsi_d, opsi_e,
              bobot_a, bobot_b, bobot_c, bobot_d, bobot_e,
              kunci, has_image, image_data,
              sumber_nama, sumber_url, sumber_halaman, sumber_no_soal,
              pembahasan,
              analisis_a, analisis_b, analisis_c, analisis_d, analisis_e,
              tips, video_url, video_title, video_channel,
              is_active
            ) VALUES (
              ?, ?, ?,
              ?, ?, ?, ?, ?,
              ?, ?, ?, ?, ?,
              ?, ?, ?,
              ?, ?, ?, ?,
              ?,
              ?, ?, ?, ?, ?,
              ?, ?, ?, ?,
              ?
            );
          `);
          stmt.run([
            kategori, subkategori, soal,
            opsi['A'] || '', opsi['B'] || '', opsi['C'] || '', opsi['D'] || '', opsi['E'] || '',
            bobot['A'] ?? 0, bobot['B'] ?? 0, bobot['C'] ?? 0, bobot['D'] ?? 0, bobot['E'] ?? 0,
            kunci, hasImage, imageData,
            sumberNama, sumberUrl, sumberHalaman, sumberNo,
            pembahasan,
            analisis['A'] || '', analisis['B'] || '', analisis['C'] || '', analisis['D'] || '', analisis['E'] || '',
            tips, videoUrl, videoTitle, videoChannel,
            isActive
          ]);
          stmt.free();
        }

        await persistSQLiteDB();
        await loadActiveQuestions();
        return id || 1;
      } catch (e) {
      }
    }

    // Fallback in-memory update
    if (questionPayload.id) {
      const idx = (window.SKD_QUESTIONS || []).findIndex(q => q.id === questionPayload.id);
      if (idx !== -1) window.SKD_QUESTIONS[idx] = questionPayload;
    } else {
      const newId = (window.SKD_QUESTIONS || []).length + 1;
      questionPayload.id = newId;
      (window.SKD_QUESTIONS || []).push(questionPayload);
    }
    await loadActiveQuestions();
    return questionPayload.id || 1;
  }

  async function deleteQuestionFromSQLite(id) {
    if (sqliteDB) {
      try {
        const stmt = sqliteDB.prepare("DELETE FROM questions WHERE id = ?;");
        stmt.run([id]);
        stmt.free();
        await persistSQLiteDB();
        await loadActiveQuestions();
        return true;
      } catch (e) {
      }
    }

    // Fallback in-memory
    const idx = (window.SKD_QUESTIONS || []).findIndex(q => q.id === id);
    if (idx !== -1) window.SKD_QUESTIONS.splice(idx, 1);
    await loadActiveQuestions();
    return true;
  }

  // --- 15. LOAD ACTIVE QUESTIONS (FOR TEST & STUDY) ---

  async function loadActiveQuestions() {
    if (sqliteDB) {
      try {
        const rows = queryRows("SELECT * FROM questions WHERE is_active = 1 ORDER BY id ASC;");
        if (rows && rows.length > 0) {
          state.questions = rows.map((r, idx) => normalizeQuestion(formatQuestionRow(r), idx));
          renderSidebar();
          return;
        }
      } catch (e) {
      }
    }

    // Fallback: window.SKD_QUESTIONS (lazy-load only if SQLite unavailable)
    await loadFallbackQuestionsScript();
    if (Array.isArray(window.SKD_QUESTIONS) && window.SKD_QUESTIONS.length > 0) {
      const activeOnly = window.SKD_QUESTIONS.filter(q => q.is_active !== 0);
      state.questions = activeOnly.map((q, idx) => normalizeQuestion(q, idx));
      renderSidebar();
    }
  }

  // --- 16. BANK SOAL VIEW RENDERING & CONTROLLER ---

  async function loadAndRenderBankSoal() {
    if (!DOM.bankSoalTableBody) return;

    DOM.bankSoalTableBody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">
          Memuat data bank soal dari database SQLite...
        </td>
      </tr>
    `;

    const questionsList = await fetchBankSoalFromSQLite();
    state.allBankQuestions = questionsList;

    const total = questionsList.length;
    const activeCount = questionsList.filter(q => q.is_active).length;
    const inactiveCount = total - activeCount;

    if (DOM.bankSoalCountBadge) {
      DOM.bankSoalCountBadge.textContent = `Total: ${total} Soal (${activeCount} Aktif, ${inactiveCount} Nonaktif)`;
    }

    if (total === 0) {
      if (DOM.bankSoalTable) DOM.bankSoalTable.style.display = 'none';
      if (DOM.bankSoalEmptyState) DOM.bankSoalEmptyState.style.display = 'flex';
      return;
    }

    if (DOM.bankSoalTable) DOM.bankSoalTable.style.display = 'table';
    if (DOM.bankSoalEmptyState) DOM.bankSoalEmptyState.style.display = 'none';

    DOM.bankSoalTableBody.innerHTML = '';

    questionsList.forEach((q, idx) => {
      const tr = document.createElement('tr');
      const isActive = !!q.is_active;

      // Badges
      let mediaBadges = '';
      if (q.has_image || q.media || q.image_data) {
        mediaBadges += `<span class="badge-mini-media">SVG Gambar</span>`;
      }
      if (q.video || q.video_url) {
        mediaBadges += `<span class="badge-mini-video">YouTube</span>`;
      }

      // Snippet text
      const cleanSnippet = (q.soal || '').replace(/<[^>]*>?/gm, '').trim();
      const snippetShort = cleanSnippet.length > 105 ? cleanSnippet.substring(0, 105) + '...' : cleanSnippet;

      tr.innerHTML = `
        <td style="text-align: center; font-weight: 700; color: var(--text-muted);">#${q.id}</td>
        <td>
          <span class="badge-cat-table ${q.kategori}">${q.kategori}</span>
          <div style="font-size: 0.775rem; color: var(--text-muted); margin-top: 3px; font-weight: 500;">
            ${escapeHTML(q.subkategori || '-')}
          </div>
        </td>
        <td>
          <div class="question-snippet-text">${escapeHTML(snippetShort)}</div>
          ${mediaBadges ? `<div style="margin-top: 4px;">${mediaBadges}</div>` : ''}
        </td>
        <td style="text-align: center;">
          <strong style="font-size: 0.95rem; color: var(--cat-primary);">${q.kategori === 'TKP' ? '1 s.d. 5' : 'Opsi ' + q.kunci}</strong>
        </td>
        <td>
          <div style="font-weight: 600; font-size: 0.8rem; color: var(--text-main);">${escapeHTML(q.sumber_nama || q.sumber || 'KepmenPAN-RB')}</div>
          <div style="font-size: 0.725rem; color: var(--text-muted);">
            ${q.sumber_halaman ? 'Hal: ' + escapeHTML(q.sumber_halaman) : ''} 
            ${q.sumber_no_soal ? '• ' + escapeHTML(q.sumber_no_soal) : ''}
          </div>
        </td>
        <td style="text-align: center;">
          <label class="toggle-switch-wrap" style="justify-content: center;" title="Klik untuk mengaktifkan / menonaktifkan soal ini">
            <input type="checkbox" class="toggle-switch-input bank-status-toggle" data-id="${q.id}" ${isActive ? 'checked' : ''}>
            <span class="toggle-slider"></span>
            <span class="toggle-status-label">${isActive ? 'Aktif' : 'Nonaktif'}</span>
          </label>
        </td>
        <td style="text-align: center;">
          <div style="display: flex; gap: 0.35rem; justify-content: center; align-items: center;">
            <button type="button" class="btn-icon-action btn-icon-preview" data-id="${q.id}" title="Lihat Detail & Analisis Lengkap">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
            </button>
            <button type="button" class="btn-icon-action btn-icon-edit" data-id="${q.id}" title="Edit Soal">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </button>
            <button type="button" class="btn-icon-action btn-icon-delete" data-id="${q.id}" title="Hapus Soal">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </td>
      `;

      DOM.bankSoalTableBody.appendChild(tr);
    });

    // Attach Toggle Switches
    DOM.bankSoalTableBody.querySelectorAll('.bank-status-toggle').forEach(input => {
      input.addEventListener('change', async () => {
        const qId = parseInt(input.getAttribute('data-id'), 10);
        const newChecked = input.checked;
        const label = input.parentElement.querySelector('.toggle-status-label');
        if (label) label.textContent = newChecked ? 'Aktif' : 'Nonaktif';
        await toggleQuestionStatusSQLite(qId, newChecked);
        // Refresh count badge
        const activeCountNow = DOM.bankSoalTableBody.querySelectorAll('.bank-status-toggle:checked').length;
        const totalNow = DOM.bankSoalTableBody.querySelectorAll('.bank-status-toggle').length;
        if (DOM.bankSoalCountBadge) {
          DOM.bankSoalCountBadge.textContent = `Total: ${totalNow} Soal (${activeCountNow} Aktif, ${totalNow - activeCountNow} Nonaktif)`;
        }
      });
    });

    // Attach Action Buttons
    DOM.bankSoalTableBody.querySelectorAll('.btn-icon-preview').forEach(btn => {
      btn.addEventListener('click', () => {
        const qId = parseInt(btn.getAttribute('data-id'), 10);
        const q = state.allBankQuestions.find(item => item.id === qId);
        if (q) openQuestionDetail(q);
      });
    });

    DOM.bankSoalTableBody.querySelectorAll('.btn-icon-edit').forEach(btn => {
      btn.addEventListener('click', () => {
        const qId = parseInt(btn.getAttribute('data-id'), 10);
        const q = state.allBankQuestions.find(item => item.id === qId);
        if (q) openQuestionForm(q);
      });
    });

    DOM.bankSoalTableBody.querySelectorAll('.btn-icon-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        const qId = parseInt(btn.getAttribute('data-id'), 10);
        const q = state.allBankQuestions.find(item => item.id === qId);
        if (q) openDeleteConfirm(q);
      });
    });
  }

  // --- 17. DETAIL PREVIEW MODAL CONTROLLER ---

  function openQuestionDetail(q) {
    state.currentDetailQuestionObj = q;

    if (DOM.detailHeaderText) DOM.detailHeaderText.textContent = `Detail & Analisis Soal #${q.id}`;
    if (DOM.detailBadgeId) DOM.detailBadgeId.textContent = `ID: #${q.id}`;
    if (DOM.detailBadgeCat) DOM.detailBadgeCat.textContent = q.kategori;
    if (DOM.detailBadgeSubcat) DOM.detailBadgeSubcat.textContent = q.subkategori || 'SKD CASN';

    if (DOM.detailBadgeStatus) {
      DOM.detailBadgeStatus.className = 'question-status-pill ' + (q.is_active ? 'answered' : 'unanswered');
      DOM.detailBadgeStatus.textContent = q.is_active ? 'Status: Aktif' : 'Status: Nonaktif';
    }

    if (DOM.detailSoalText) DOM.detailSoalText.innerHTML = q.soal;

    if (DOM.detailMediaContainer) {
      if (q.has_image || q.media || q.image_data) {
        DOM.detailMediaContainer.innerHTML = q.image_data || q.media;
        DOM.detailMediaContainer.style.display = 'block';
      } else {
        DOM.detailMediaContainer.innerHTML = '';
        DOM.detailMediaContainer.style.display = 'none';
      }
    }

    // Render Options List
    if (DOM.detailOptionsContainer) {
      DOM.detailOptionsContainer.innerHTML = '';
      const optionKeys = ['A', 'B', 'C', 'D', 'E'];
      optionKeys.forEach(k => {
        const isKey = (k === q.kunci);
        const weight = (q.bobot && typeof q.bobot[k] === 'number') ? q.bobot[k] : (isKey ? 5 : 0);

        const card = document.createElement('div');
        card.className = 'option-card show-feedback' + (isKey ? ' is-correct-key' : '');
        card.innerHTML = `
          <span class="option-indicator">${k}</span>
          <div class="option-text">${escapeHTML(q.opsi[k] || '')}</div>
          <span class="option-score-pill">${q.kategori === 'TKP' ? '+' + weight : (isKey ? '+5' : '0')}</span>
        `;
        DOM.detailOptionsContainer.appendChild(card);
      });
    }

    if (DOM.detailPembahasanText) DOM.detailPembahasanText.innerHTML = q.pembahasan || 'Pembahasan materi.';

    // Option-by-Option Breakdown
    if (DOM.detailAnalysisContainer) {
      DOM.detailAnalysisContainer.innerHTML = '';
      const optionKeys = ['A', 'B', 'C', 'D', 'E'];
      optionKeys.forEach(k => {
        const isKey = (k === q.kunci);
        const weight = (q.bobot && typeof q.bobot[k] === 'number') ? q.bobot[k] : (isKey ? 5 : 0);
        const optText = (q.analisis_opsi && q.analisis_opsi[k]) ? q.analisis_opsi[k] : '';

        const item = document.createElement('div');
        item.className = 'option-breakdown-item';
        item.innerHTML = `
          <span class="option-breakdown-letter ${isKey ? 'key' : ''}">${k}</span>
          <div class="option-breakdown-desc">
            <strong>Opsi ${k} (${q.kategori === 'TKP' ? 'Skor ' + weight : (isKey ? 'Kunci +5' : '0 Poin')}):</strong> 
            ${escapeHTML(optText)}
          </div>
        `;
        DOM.detailAnalysisContainer.appendChild(item);
      });
    }

    if (DOM.detailTipsText) DOM.detailTipsText.innerHTML = q.tips || '-';

    // Video Player (Tangguh Terhadap Error 153 & Dilengkapi Timestamp)
    if (DOM.detailVideoContainer) {
      if (q.video && q.video.url) {
        DOM.detailVideoContainer.style.display = 'block';
        const embedUrl = toYouTubeEmbedUrl(q.video.url, q.video.startSeconds);
        if (DOM.detailVideoIframe) {
          DOM.detailVideoIframe.referrerPolicy = 'strict-origin-when-cross-origin';
          DOM.detailVideoIframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
          DOM.detailVideoIframe.setAttribute('allowfullscreen', 'true');
          if (DOM.detailVideoIframe.src !== embedUrl) {
            DOM.detailVideoIframe.src = embedUrl;
          }
        }
        if (DOM.detailVideoTitle) DOM.detailVideoTitle.textContent = q.video.title || `Video Pembahasan Soal #${q.id}`;
        if (DOM.detailVideoChannel) DOM.detailVideoChannel.textContent = 'Channel: ' + (q.video.channel || 'Edukasi CASN');
        if (DOM.detailVideoTimestamp) {
          if (q.video.startSeconds > 0 || q.video.timestamp) {
            const timeLabel = q.video.timestamp || formatTimestamp(q.video.startSeconds);
            const topicLabel = q.video.topic_part ? ` - ${q.video.topic_part}` : '';
            DOM.detailVideoTimestamp.textContent = `⏱️ Mulai Menit ${timeLabel}${topicLabel}`;
            DOM.detailVideoTimestamp.style.display = 'inline-flex';
          } else {
            DOM.detailVideoTimestamp.style.display = 'none';
          }
        }
        if (DOM.detailVideoLink) {
          const watchUrl = q.video.watchUrl || toYouTubeWatchUrl(q.video.url, q.video.startSeconds);
          DOM.detailVideoLink.href = watchUrl;
          const textSpan = DOM.detailVideoLink.querySelector('span');
          if (q.video.startSeconds > 0 || q.video.timestamp) {
            const timeLabel = q.video.timestamp || formatTimestamp(q.video.startSeconds);
            if (textSpan) textSpan.textContent = `Buka & Tonton Langsung pada Menit ${timeLabel} →`;
          } else {
            if (textSpan) textSpan.textContent = 'Buka & Tonton Langsung di YouTube →';
          }
        }
      } else {
        DOM.detailVideoContainer.style.display = 'none';
        if (DOM.detailVideoIframe) DOM.detailVideoIframe.src = '';
      }
    }

    // Source Metadata
    if (DOM.detailSumberNama) DOM.detailSumberNama.textContent = q.sumber_nama || q.sumber || '-';
    if (DOM.detailSumberUrl) {
      if (q.sumber_url) {
        DOM.detailSumberUrl.innerHTML = `<a href="${escapeHTML(q.sumber_url)}" target="_blank" rel="noopener noreferrer" style="color:var(--cat-primary); text-decoration:underline; word-break:break-all;">${escapeHTML(q.sumber_url)} &rarr;</a>`;
      } else {
        DOM.detailSumberUrl.textContent = '-';
      }
    }
    if (DOM.detailSumberHalaman) DOM.detailSumberHalaman.textContent = q.sumber_halaman || '-';
    if (DOM.detailSumberNo) DOM.detailSumberNo.textContent = q.sumber_no_soal || '-';

    if (DOM.modalQuestionDetail) DOM.modalQuestionDetail.classList.add('open');
  }

  function closeQuestionDetail() {
    if (DOM.modalQuestionDetail) DOM.modalQuestionDetail.classList.remove('open');
    if (DOM.detailVideoIframe) DOM.detailVideoIframe.src = '';
    state.currentDetailQuestionObj = null;
  }

  // --- 18. ADD / EDIT QUESTION FORM CONTROLLER ---

  function openQuestionForm(q = null) {
    state.editingQuestionId = q ? q.id : null;

    if (DOM.formTitleText) {
      DOM.formTitleText.textContent = q ? `Edit Butir Soal #${q.id}` : 'Tambah Soal Baru ke SQLite';
    }

    if (DOM.formQuestionId) DOM.formQuestionId.value = q ? q.id : '';
    if (DOM.formKategori) DOM.formKategori.value = q ? q.kategori : 'TWK';
    if (DOM.formSubkategori) DOM.formSubkategori.value = q ? (q.subkategori || '') : '';
    if (DOM.formIsActive) DOM.formIsActive.checked = q ? (q.is_active ? true : false) : true;
    if (DOM.formSoal) DOM.formSoal.value = q ? (q.soal || '') : '';

    const hasImg = q ? (q.has_image || !emptyMedia(q.image_data || q.media)) : false;
    if (DOM.formHasImage) DOM.formHasImage.checked = !!hasImg;
    if (DOM.formImageData) DOM.formImageData.value = q ? (q.image_data || q.media || '') : '';

    if (DOM.formKunci) DOM.formKunci.value = q ? q.kunci : 'A';

    // Options A - E
    const optionKeys = ['A', 'B', 'C', 'D', 'E'];
    optionKeys.forEach(k => {
      const optInput = document.getElementById(`form-opsi-${k}`);
      const bobotInput = document.getElementById(`form-bobot-${k}`);
      const analisisInput = document.getElementById(`form-analisis-${k}`);

      if (optInput) optInput.value = q ? (q.opsi[k] || '') : '';
      if (bobotInput) {
        if (q) {
          bobotInput.value = (q.bobot && typeof q.bobot[k] === 'number') ? q.bobot[k] : (k === q.kunci ? 5 : 0);
        } else {
          bobotInput.value = (k === 'A') ? 5 : 0;
        }
      }
      if (analisisInput) analisisInput.value = q ? (q.analisis_opsi[k] || '') : '';
    });

    if (DOM.formPembahasan) DOM.formPembahasan.value = q ? (q.pembahasan || '') : '';
    if (DOM.formTips) DOM.formTips.value = q ? (q.tips || '') : '';

    // Video
    if (DOM.formVideoUrl) DOM.formVideoUrl.value = q ? (q.video_url || (q.video ? q.video.url : '')) : '';
    if (DOM.formVideoTitle) DOM.formVideoTitle.value = q ? (q.video_title || (q.video ? q.video.title : '')) : '';
    if (DOM.formVideoChannel) DOM.formVideoChannel.value = q ? (q.video_channel || (q.video ? q.video.channel : '')) : '';
    if (DOM.formVideoTimestamp) DOM.formVideoTimestamp.value = q && q.video ? (q.video.timestamp || '') : '';
    if (DOM.formVideoStartSeconds) DOM.formVideoStartSeconds.value = q && q.video ? (q.video.startSeconds || '') : '';

    // Source Metadata
    if (DOM.formSumberNama) DOM.formSumberNama.value = q ? (q.sumber_nama || q.sumber || '') : 'KepmenPAN-RB No. 674 Tahun 2026';
    if (DOM.formSumberUrl) DOM.formSumberUrl.value = q ? (q.sumber_url || '') : 'https://menpan.go.id';
    if (DOM.formSumberHalaman) DOM.formSumberHalaman.value = q ? (q.sumber_halaman || '') : '';
    if (DOM.formSumberNo) DOM.formSumberNo.value = q ? (q.sumber_no_soal || '') : '';

    if (DOM.modalQuestionForm) DOM.modalQuestionForm.classList.add('open');
  }

  function closeQuestionForm() {
    if (DOM.modalQuestionForm) DOM.modalQuestionForm.classList.remove('open');
    state.editingQuestionId = null;
  }

  async function handleQuestionFormSubmit(e) {
    e.preventDefault();

    const id = state.editingQuestionId ? parseInt(state.editingQuestionId, 10) : 0;
    const kategori = DOM.formKategori ? DOM.formKategori.value : 'TWK';
    const subkategori = DOM.formSubkategori ? DOM.formSubkategori.value.trim() : '';
    const isActive = DOM.formIsActive ? (DOM.formIsActive.checked ? 1 : 0) : 1;
    const soal = DOM.formSoal ? DOM.formSoal.value.trim() : '';
    const hasImage = DOM.formHasImage ? (DOM.formHasImage.checked ? 1 : 0) : 0;
    const imageData = DOM.formImageData ? DOM.formImageData.value.trim() : '';
    const kunci = DOM.formKunci ? DOM.formKunci.value : 'A';

    const opsi = {
      A: DOM.formOpsiA ? DOM.formOpsiA.value.trim() : '',
      B: DOM.formOpsiB ? DOM.formOpsiB.value.trim() : '',
      C: DOM.formOpsiC ? DOM.formOpsiC.value.trim() : '',
      D: DOM.formOpsiD ? DOM.formOpsiD.value.trim() : '',
      E: DOM.formOpsiE ? DOM.formOpsiE.value.trim() : ''
    };

    const bobot = {
      A: parseInt(DOM.formBobotA ? DOM.formBobotA.value : 0, 10) || 0,
      B: parseInt(DOM.formBobotB ? DOM.formBobotB.value : 0, 10) || 0,
      C: parseInt(DOM.formBobotC ? DOM.formBobotC.value : 0, 10) || 0,
      D: parseInt(DOM.formBobotD ? DOM.formBobotD.value : 0, 10) || 0,
      E: parseInt(DOM.formBobotE ? DOM.formBobotE.value : 0, 10) || 0
    };

    const pembahasan = DOM.formPembahasan ? DOM.formPembahasan.value.trim() : '';
    const analisisOps = {
      A: DOM.formAnalisisA ? DOM.formAnalisisA.value.trim() : '',
      B: DOM.formAnalisisB ? DOM.formAnalisisB.value.trim() : '',
      C: DOM.formAnalisisC ? DOM.formAnalisisC.value.trim() : '',
      D: DOM.formAnalisisD ? DOM.formAnalisisD.value.trim() : '',
      E: DOM.formAnalisisE ? DOM.formAnalisisE.value.trim() : ''
    };

    const tips = DOM.formTips ? DOM.formTips.value.trim() : '';
    const videoTimestamp = DOM.formVideoTimestamp ? DOM.formVideoTimestamp.value.trim() : '';
    const videoStartSec = parseInt(DOM.formVideoStartSeconds ? DOM.formVideoStartSeconds.value : 0, 10) || parseTimestampToSeconds(videoTimestamp);
    const videoUrl = DOM.formVideoUrl ? toYouTubeEmbedUrl(DOM.formVideoUrl.value.trim(), videoStartSec) : '';
    const videoTitle = DOM.formVideoTitle ? DOM.formVideoTitle.value.trim() : '';
    const videoChannel = DOM.formVideoChannel ? DOM.formVideoChannel.value.trim() : '';

    const sumberNama = DOM.formSumberNama ? DOM.formSumberNama.value.trim() : '';
    const sumberUrl = DOM.formSumberUrl ? DOM.formSumberUrl.value.trim() : '';
    const sumberHalaman = DOM.formSumberHalaman ? DOM.formSumberHalaman.value.trim() : '';
    const sumberNo = DOM.formSumberNo ? DOM.formSumberNo.value.trim() : '';

    const payload = {
      id,
      kategori,
      subkategori,
      soal,
      is_active: isActive,
      has_image: hasImage,
      image_data: imageData,
      media: imageData,
      kunci,
      opsi,
      bobot,
      pembahasan,
      analisis_opsi: analisisOps,
      tips,
      video_url: videoUrl,
      video_title: videoTitle,
      video_channel: videoChannel,
      sumber_nama: sumberNama,
      sumber_url: sumberUrl,
      sumber_halaman: sumberHalaman,
      sumber_no_soal: sumberNo
    };

    closeQuestionForm();
    await saveQuestionToSQLite(payload);
    await loadAndRenderBankSoal();
  }

  // --- 19. DELETE CONFIRMATION MODAL CONTROLLER ---

  function openDeleteConfirm(q) {
    state.deletingQuestionObj = q;
    if (DOM.deleteQSnippet) {
      const cleanSnippet = (q.soal || '').replace(/<[^>]*>?/gm, '').trim();
      const snippetShort = cleanSnippet.length > 110 ? cleanSnippet.substring(0, 110) + '...' : cleanSnippet;
      DOM.deleteQSnippet.innerHTML = `<strong>Soal #${q.id} (${escapeHTML(q.kategori)}):</strong> ${escapeHTML(snippetShort)}`;
    }
    if (DOM.modalConfirmDeleteQ) DOM.modalConfirmDeleteQ.classList.add('open');
  }

  function closeDeleteConfirm() {
    if (DOM.modalConfirmDeleteQ) DOM.modalConfirmDeleteQ.classList.remove('open');
    state.deletingQuestionObj = null;
  }

  async function handleConfirmDelete() {
    if (!state.deletingQuestionObj) return;
    const qId = state.deletingQuestionObj.id;
    closeDeleteConfirm();
    await deleteQuestionFromSQLite(qId);
    await loadAndRenderBankSoal();
  }

  // --- 20. SESSION HISTORY SCREEN CONTROLLER ---

  async function loadAndRenderHistory() {
    if (!DOM.historyTableBody) return;
    DOM.historyTableBody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 2rem; color: var(--text-muted);">
          Memuat data riwayat dari database SQLite...
        </td>
      </tr>
    `;

    const sessions = await fetchHistoryFromSQLite();

    const totalCount = sessions.length;
    let passedCount = 0;
    let highestScore = 0;
    let sumScore = 0;

    sessions.forEach(s => {
      const total = Number(s.total_score || 0);
      sumScore += total;
      if (total > highestScore) highestScore = total;
      if (Number(s.pass_total) === 1) passedCount++;
    });

    const passRate = totalCount > 0 ? Math.round((passedCount / totalCount) * 100) : 0;
    const avgScore = totalCount > 0 ? Math.round(sumScore / totalCount) : 0;

    if (DOM.statHistoryTotal) DOM.statHistoryTotal.textContent = totalCount;
    if (DOM.statHistoryPassed) DOM.statHistoryPassed.textContent = `${passRate}%`;
    if (DOM.statHistoryHighest) DOM.statHistoryHighest.textContent = highestScore;
    if (DOM.statHistoryAvg) DOM.statHistoryAvg.textContent = avgScore;

    if (totalCount === 0) {
      if (DOM.historyTableContainer) DOM.historyTableContainer.style.display = 'none';
      if (DOM.historyEmptyState) DOM.historyEmptyState.style.display = 'flex';
      return;
    }

    if (DOM.historyTableContainer) DOM.historyTableContainer.style.display = 'block';
    if (DOM.historyEmptyState) DOM.historyEmptyState.style.display = 'none';

    DOM.historyTableBody.innerHTML = '';

    sessions.forEach(s => {
      const tr = document.createElement('tr');
      const isPassed = Number(s.pass_total) === 1;

      let dateDisplay = s.created_at || '-';
      try {
        const dt = new Date(s.created_at);
        if (!isNaN(dt.getTime())) {
          dateDisplay = `${dt.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}, ${dt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`;
        }
      } catch (e) {}

      tr.innerHTML = `
        <td><strong>#${s.id}</strong></td>
        <td>
          <div style="font-weight: 600; color: var(--text-main);">${escapeHTML(dateDisplay)}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">${Math.ceil((s.duration_seconds || 0) / 60)} Menit pengerjaan</div>
        </td>
        <td>
          <span style="font-weight: 700; color: ${s.twk_score >= 65 ? 'var(--success)' : 'var(--danger)'};">
            ${s.twk_score}
          </span>
          <span style="font-size: 0.72rem; color: var(--text-muted);">/150</span>
        </td>
        <td>
          <span style="font-weight: 700; color: ${s.tiu_score >= 80 ? 'var(--success)' : 'var(--danger)'};">
            ${s.tiu_score}
          </span>
          <span style="font-size: 0.72rem; color: var(--text-muted);">/175</span>
        </td>
        <td>
          <span style="font-weight: 700; color: ${s.tkp_score >= 166 ? 'var(--success)' : 'var(--danger)'};">
            ${s.tkp_score}
          </span>
          <span style="font-size: 0.72rem; color: var(--text-muted);">/225</span>
        </td>
        <td>
          <strong style="font-size: 1.05rem; color: var(--cat-primary);">${s.total_score}</strong>
          <span style="font-size: 0.75rem; color: var(--text-muted);">/ 550</span>
        </td>
        <td>
          <span class="score-badge-status ${isPassed ? 'pass' : 'fail'}">
            ${isPassed ? 'LULUS PG' : 'TIDAK LULUS'}
          </span>
        </td>
        <td>
          <div style="display: flex; gap: 0.35rem; align-items: center;">
            <button type="button" class="btn-eval-session" data-session-id="${s.id}" title="Buka Evaluasi Lengkap Sesi Ini">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
              <span>Buka Evaluasi</span>
            </button>
            <button type="button" class="btn-delete-session" data-session-id="${s.id}" title="Hapus Rekaman Sesi Ini">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </td>
      `;

      DOM.historyTableBody.appendChild(tr);
    });

    DOM.historyTableBody.querySelectorAll('.btn-eval-session').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.getAttribute('data-session-id'), 10);
        openSavedSessionEvaluation(id);
      });
    });

    DOM.historyTableBody.querySelectorAll('.btn-delete-session').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = parseInt(btn.getAttribute('data-session-id'), 10);
        if (confirm(`Hapus rekaman sesi ujian #${id} dari database SQLite?`)) {
          await deleteSessionFromSQLite(id);
          loadAndRenderHistory();
        }
      });
    });
  }

  async function openSavedSessionEvaluation(sessionId) {
    const sessionDetail = await getSessionDetailFromSQLite(sessionId);
    if (!sessionDetail) {
      alert('Data sesi tidak ditemukan dalam database.');
      return;
    }

    state.activeSessionId = sessionId;
    state.activeSessionMeta = sessionDetail;
    state.answers = sessionDetail.answers || {};
    state.isFinished = true;
    state.mode = 'review';

    showScreen('exam');

    if (DOM.tabModeReview) DOM.tabModeReview.style.display = 'inline-flex';
    if (DOM.tabModeReview) DOM.tabModeReview.classList.add('active');
    if (DOM.tabModeBelajar) DOM.tabModeBelajar.classList.remove('active');

    if (DOM.reviewSessionInfoBanner) {
      DOM.reviewSessionInfoBanner.style.display = 'flex';
      const isPassed = Number(sessionDetail.pass_total) === 1;
      let dateText = sessionDetail.created_at || '';
      try {
        const dt = new Date(sessionDetail.created_at);
        if (!isNaN(dt.getTime())) {
          dateText = dt.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
        }
      } catch (e) {}

      if (DOM.reviewSessionInfoText) {
        DOM.reviewSessionInfoText.innerHTML = `
          <strong>Evaluasi Sesi #${sessionDetail.id}</strong> (${escapeHTML(dateText)}): 
          TWK: <strong>${sessionDetail.twk_score}</strong>, TIU: <strong>${sessionDetail.tiu_score}</strong>, TKP: <strong>${sessionDetail.tkp_score}</strong> • 
          Total: <strong style="color:var(--cat-primary);">${sessionDetail.total_score}</strong> 
          <span class="score-badge-status ${isPassed ? 'pass' : 'fail'}" style="margin-left:6px;">${isPassed ? 'LULUS PG' : 'TIDAK LULUS'}</span>
        `;
      }
    }

    if (DOM.questionCard) DOM.questionCard.style.display = 'none';
    if (DOM.reviewSessionView) {
      DOM.reviewSessionView.classList.add('active');
      renderReviewSessionView();
    }

    renderSidebar();
  }

  // --- 21. START NEW SIMULATION & STUDY MODES ---

  function startSimulationMode() {
    clearActiveExamState();

    state.mode = 'simulasi';
    state.answers = {};
    state.ragu = {};
    state.visited = {};
    state.studyAnswers = {};
    state.studyRevealed = {};
    state.timeRemaining = CONFIG.EXAM_DURATION_SECONDS;
    state.currentIndex = 0;
    state.isFinished = false;
    state.startTime = Date.now();
    state.activeSessionId = null;
    state.activeSessionMeta = null;

    document.body.classList.add('simulation-mode-active');

    if (DOM.badgeSimLocked) DOM.badgeSimLocked.style.display = 'inline-flex';
    if (DOM.timerBox) DOM.timerBox.style.display = 'flex';
    if (DOM.btnFinishExam) DOM.btnFinishExam.style.display = 'inline-flex';
    if (DOM.tabModeReview) DOM.tabModeReview.style.display = 'none';
    if (DOM.reviewSessionInfoBanner) DOM.reviewSessionInfoBanner.style.display = 'none';

    showScreen('exam');

    if (DOM.questionCard) DOM.questionCard.style.display = 'block';
    if (DOM.reviewSessionView) DOM.reviewSessionView.classList.remove('active');

    startTimer();
    renderCurrentQuestion();
    renderSidebar();
  }

  function startStudyMode() {
    state.mode = 'belajar';
    state.activeSessionId = null;
    state.activeSessionMeta = null;

    document.body.classList.remove('simulation-mode-active');

    if (DOM.badgeSimLocked) DOM.badgeSimLocked.style.display = 'none';
    if (DOM.timerBox) DOM.timerBox.style.display = 'none';
    if (DOM.btnFinishExam) DOM.btnFinishExam.style.display = 'none';
    if (DOM.tabModeReview) DOM.tabModeReview.style.display = 'none';
    if (DOM.reviewSessionInfoBanner) DOM.reviewSessionInfoBanner.style.display = 'none';

    if (DOM.tabModeBelajar) DOM.tabModeBelajar.classList.add('active');

    showScreen('exam');

    if (DOM.questionCard) DOM.questionCard.style.display = 'block';
    if (DOM.reviewSessionView) DOM.reviewSessionView.classList.remove('active');

    pauseTimer();
    renderCurrentQuestion();
    renderSidebar();
  }

  function openMobileDrawer() {
    if (DOM.sidebarViewport) DOM.sidebarViewport.classList.add('open');
    if (DOM.mobileDrawerBackdrop) DOM.mobileDrawerBackdrop.classList.add('open');
  }

  function closeMobileDrawer() {
    if (DOM.sidebarViewport) DOM.sidebarViewport.classList.remove('open');
    if (DOM.mobileDrawerBackdrop) DOM.mobileDrawerBackdrop.classList.remove('open');
  }

  // --- 22. EVENT LISTENERS SETUP ---

  function initEventListeners() {
    // Top Header Navigation
    if (DOM.brandHomeLink) {
      DOM.brandHomeLink.addEventListener('click', () => {
        if (state.mode === 'simulasi' && !state.isFinished && state.currentScreen === 'exam') {
          if (confirm('Ujian simulasi sedang berlangsung. Apakah Anda ingin keluar ke Portal Utama? (Waktu dan jawaban tetap tersimpan)')) {
            showScreen('landing');
          }
        } else {
          showScreen('landing');
        }
      });
    }

    if (DOM.btnHeaderHistory) {
      DOM.btnHeaderHistory.addEventListener('click', () => {
        if (state.mode === 'simulasi' && !state.isFinished && state.currentScreen === 'exam') {
          if (confirm('Ujian simulasi sedang berlangsung. Buka riwayat sesi sekarang? (Simulasi akan dijeda)')) {
            showScreen('history');
          }
        } else {
          showScreen('history');
        }
      });
    }

    if (DOM.btnHeaderBankSoal) {
      DOM.btnHeaderBankSoal.addEventListener('click', () => {
        if (state.mode === 'simulasi' && !state.isFinished && state.currentScreen === 'exam') {
          if (confirm('Ujian simulasi sedang berlangsung. Buka Manajemen Bank Soal sekarang?')) {
            showScreen('bank-soal');
          }
        } else {
          showScreen('bank-soal');
        }
      });
    }

    // Landing Screen Actions
    if (DOM.btnStartSimulation) DOM.btnStartSimulation.addEventListener('click', startSimulationMode);
    if (DOM.btnStartStudy) DOM.btnStartStudy.addEventListener('click', startStudyMode);
    if (DOM.btnViewHistory) DOM.btnViewHistory.addEventListener('click', () => showScreen('history'));
    if (DOM.btnViewBankSoal) DOM.btnViewBankSoal.addEventListener('click', () => showScreen('bank-soal'));

    // Bank Soal Screen Events
    if (DOM.btnBankSoalBack) DOM.btnBankSoalBack.addEventListener('click', () => showScreen('landing'));
    if (DOM.btnAddQuestion) DOM.btnAddQuestion.addEventListener('click', () => openQuestionForm(null));

    // SQLite Export & Import (Bank Soal Screen)
    if (DOM.btnExportDb) DOM.btnExportDb.addEventListener('click', exportDatabaseFile);
    if (DOM.btnImportDbTrigger) {
      DOM.btnImportDbTrigger.addEventListener('click', () => {
        if (DOM.inputImportDb) DOM.inputImportDb.click();
      });
    }
    if (DOM.inputImportDb) {
      DOM.inputImportDb.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          importDatabaseFile(e.target.files[0]);
          e.target.value = '';
        }
      });
    }

    // SQLite Export & Import (History Screen)
    if (DOM.btnHistoryExportDb) DOM.btnHistoryExportDb.addEventListener('click', exportDatabaseFile);
    if (DOM.btnHistoryImportDbTrigger) {
      DOM.btnHistoryImportDbTrigger.addEventListener('click', () => {
        if (DOM.inputHistoryImportDb) DOM.inputHistoryImportDb.click();
      });
    }
    if (DOM.inputHistoryImportDb) {
      DOM.inputHistoryImportDb.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          importDatabaseFile(e.target.files[0]);
          e.target.value = '';
        }
      });
    }

    if (DOM.bankSoalSearch) {
      let searchTimeout;
      DOM.bankSoalSearch.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
          state.bankSearchQuery = DOM.bankSoalSearch.value.trim();
          loadAndRenderBankSoal();
        }, 300);
      });
    }

    if (DOM.bankSoalFilterCat) {
      DOM.bankSoalFilterCat.addEventListener('change', () => {
        state.bankFilterCat = DOM.bankSoalFilterCat.value;
        loadAndRenderBankSoal();
      });
    }

    if (DOM.bankSoalFilterStatus) {
      DOM.bankSoalFilterStatus.addEventListener('change', () => {
        state.bankFilterStatus = DOM.bankSoalFilterStatus.value;
        loadAndRenderBankSoal();
      });
    }

    if (DOM.btnResetBankFilters) {
      DOM.btnResetBankFilters.addEventListener('click', () => {
        state.bankFilterCat = 'all';
        state.bankFilterStatus = 'all';
        state.bankSearchQuery = '';
        if (DOM.bankSoalSearch) DOM.bankSoalSearch.value = '';
        if (DOM.bankSoalFilterCat) DOM.bankSoalFilterCat.value = 'all';
        if (DOM.bankSoalFilterStatus) DOM.bankSoalFilterStatus.value = 'all';
        loadAndRenderBankSoal();
      });
    }

    // Form Tambah/Edit Soal
    if (DOM.formQuestion) DOM.formQuestion.addEventListener('submit', handleQuestionFormSubmit);
    if (DOM.btnCancelForm) DOM.btnCancelForm.addEventListener('click', closeQuestionForm);
    if (DOM.btnCloseFormX) DOM.btnCloseFormX.addEventListener('click', closeQuestionForm);

    // Detail Preview Modal
    if (DOM.btnCloseDetail) DOM.btnCloseDetail.addEventListener('click', closeQuestionDetail);
    if (DOM.btnCloseDetailX) DOM.btnCloseDetailX.addEventListener('click', closeQuestionDetail);
    if (DOM.btnDetailToEdit) {
      DOM.btnDetailToEdit.addEventListener('click', () => {
        const q = state.currentDetailQuestionObj;
        closeQuestionDetail();
        if (q) openQuestionForm(q);
      });
    }

    // Delete Confirm Modal
    if (DOM.btnCancelDeleteQ) DOM.btnCancelDeleteQ.addEventListener('click', closeDeleteConfirm);
    if (DOM.btnConfirmDeleteQ) DOM.btnConfirmDeleteQ.addEventListener('click', handleConfirmDelete);

    // Exam Subnav
    if (DOM.btnExamBackHome) {
      DOM.btnExamBackHome.addEventListener('click', () => {
        if (state.mode === 'simulasi' && !state.isFinished) {
          if (confirm('Ujian simulasi sedang berlangsung. Kembali ke Portal Utama?')) {
            showScreen('landing');
          }
        } else {
          showScreen('landing');
        }
      });
    }

    if (DOM.tabModeBelajar) {
      DOM.tabModeBelajar.addEventListener('click', () => {
        if (state.mode !== 'simulasi' || state.isFinished) {
          startStudyMode();
        }
      });
    }

    if (DOM.tabModeReview) {
      DOM.tabModeReview.addEventListener('click', () => {
        state.mode = 'review';
        if (DOM.questionCard) DOM.questionCard.style.display = 'none';
        if (DOM.reviewSessionView) {
          DOM.reviewSessionView.classList.add('active');
          renderReviewSessionView();
        }
      });
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

    if (DOM.btnCancelFinish) DOM.btnCancelFinish.addEventListener('click', closeConfirmFinishModal);
    if (DOM.btnSubmitExamFinal) DOM.btnSubmitExamFinal.addEventListener('click', () => finishExam(false));

    // Modal backdrops click-to-close
    [
      DOM.modalConfirmFinish,
      DOM.modalResult,
      DOM.modalQuestionDetail,
      DOM.modalConfirmDeleteQ
    ].forEach(modal => {
      if (modal) {
        modal.addEventListener('click', (e) => {
          if (e.target === modal) {
            modal.classList.remove('open');
            if (DOM.detailVideoIframe) DOM.detailVideoIframe.src = '';
          }
        });
      }
    });

    // Question Navigation Controls
    if (DOM.btnPrev) {
      DOM.btnPrev.addEventListener('click', () => {
        if (state.currentIndex > 0) {
          state.currentIndex--;
          renderCurrentQuestion();
        }
      });
    }

    // Mobile Drawer & Bottom Bar Controls
    if (DOM.btnMobileGridDrawer) {
      DOM.btnMobileGridDrawer.addEventListener('click', openMobileDrawer);
    }
    if (DOM.btnCloseMobileDrawer) {
      DOM.btnCloseMobileDrawer.addEventListener('click', closeMobileDrawer);
    }
    if (DOM.mobileDrawerBackdrop) {
      DOM.mobileDrawerBackdrop.addEventListener('click', closeMobileDrawer);
    }
    if (DOM.btnMobilePrev && DOM.btnPrev) {
      DOM.btnMobilePrev.addEventListener('click', () => DOM.btnPrev.click());
    }
    if (DOM.btnMobileNext && DOM.btnNext) {
      DOM.btnMobileNext.addEventListener('click', () => DOM.btnNext.click());
    }
    if (DOM.btnMobileRagu && DOM.btnRagu) {
      DOM.btnMobileRagu.addEventListener('click', () => DOM.btnRagu.click());
    }

    if (DOM.btnNext) {
      DOM.btnNext.addEventListener('click', () => {
        if (state.currentIndex < state.questions.length - 1) {
          state.currentIndex++;
          renderCurrentQuestion();
        } else {
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

    // Ragu-Ragu Toggle
    const toggleRagu = () => {
      const q = state.questions[state.currentIndex];
      if (!q) return;
      state.ragu[q.id] = !state.ragu[q.id];
      renderCurrentQuestion();
    };

    if (DOM.btnRagu) {
      DOM.btnRagu.addEventListener('click', (e) => {
        if (e.target !== DOM.checkboxRagu) toggleRagu();
      });
    }
    if (DOM.checkboxRagu) DOM.checkboxRagu.addEventListener('change', toggleRagu);

    // Study Mode Actions
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
        closeMobileDrawer();
      });
    }

    // Sidebar Grid Range Subfilters
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

    // Subnav Category Filters
    if (DOM.categoryFilterBtns) {
      DOM.categoryFilterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          DOM.categoryFilterBtns.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const filter = btn.getAttribute('data-category-filter') || 'all';
          state.categoryFilter = filter;

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

    // Review Back buttons
    if (DOM.btnBackToExamFromReview) {
      DOM.btnBackToExamFromReview.addEventListener('click', () => {
        if (DOM.questionCard) DOM.questionCard.style.display = 'block';
        if (DOM.reviewSessionView) DOM.reviewSessionView.classList.remove('active');
        renderCurrentQuestion();
        closeMobileDrawer();
      });
    }

    if (DOM.btnBackToHistoryFromReview) DOM.btnBackToHistoryFromReview.addEventListener('click', () => showScreen('history'));
    if (DOM.btnBackToHomeFromReview) DOM.btnBackToHomeFromReview.addEventListener('click', () => showScreen('landing'));

    // History Screen Buttons
    if (DOM.btnHistoryBack) DOM.btnHistoryBack.addEventListener('click', () => showScreen('landing'));
    if (DOM.btnEmptyStartSim) DOM.btnEmptyStartSim.addEventListener('click', startSimulationMode);

    if (DOM.btnResetAllHistory) {
      DOM.btnResetAllHistory.addEventListener('click', async () => {
        if (confirm('PERHATIAN: Apakah Anda yakin ingin MENGHAPUS SELURUH riwayat ujian dari database SQLite? Data yang dihapus tidak dapat dipulihkan.')) {
          await resetAllHistoryInSQLite();
          loadAndRenderHistory();
        }
      });
    }

    // Result Modal Actions
    if (DOM.btnOpenReview) {
      DOM.btnOpenReview.addEventListener('click', () => {
        if (DOM.modalResult) DOM.modalResult.classList.remove('open');
        state.mode = 'review';
        showScreen('exam');
        if (DOM.questionCard) DOM.questionCard.style.display = 'none';
        if (DOM.reviewSessionView) {
          DOM.reviewSessionView.classList.add('active');
          renderReviewSessionView();
        }
      });
    }

    if (DOM.btnOpenHistoryFromCert) {
      DOM.btnOpenHistoryFromCert.addEventListener('click', () => {
        if (DOM.modalResult) DOM.modalResult.classList.remove('open');
        showScreen('history');
      });
    }

    if (DOM.btnPrintResult) DOM.btnPrintResult.addEventListener('click', () => window.print());
    if (DOM.btnRestartExam) {
      DOM.btnRestartExam.addEventListener('click', () => {
        if (DOM.modalResult) DOM.modalResult.classList.remove('open');
        showScreen('landing');
      });
    }

    // Font Scaling
    const setFontSize = (sizeClass) => {
      document.body.classList.remove('font-sm', 'font-md', 'font-lg');
      document.body.classList.add(sizeClass);
      state.fontSize = sizeClass;
      if (DOM.btnFontDec) DOM.btnFontDec.classList.toggle('active', sizeClass === 'font-sm');
      if (DOM.btnFontReset) DOM.btnFontReset.classList.toggle('active', sizeClass === 'font-md');
      if (DOM.btnFontInc) DOM.btnFontInc.classList.toggle('active', sizeClass === 'font-lg');
      saveActiveExamState();
    };

    if (DOM.btnFontDec) DOM.btnFontDec.addEventListener('click', () => setFontSize('font-sm'));
    if (DOM.btnFontReset) DOM.btnFontReset.addEventListener('click', () => setFontSize('font-md'));
    if (DOM.btnFontInc) DOM.btnFontInc.addEventListener('click', () => setFontSize('font-lg'));

    // Keyboard Shortcuts Navigation
    window.addEventListener('keydown', (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      if (DOM.modalConfirmFinish && DOM.modalConfirmFinish.classList.contains('open')) {
        if (e.key === 'Escape') closeConfirmFinishModal();
        return;
      }
      if (DOM.modalResult && DOM.modalResult.classList.contains('open')) {
        if (e.key === 'Escape') DOM.modalResult.classList.remove('open');
        return;
      }
      if (DOM.modalQuestionDetail && DOM.modalQuestionDetail.classList.contains('open')) {
        if (e.key === 'Escape') closeQuestionDetail();
        return;
      }
      if (DOM.modalQuestionForm && DOM.modalQuestionForm.classList.contains('open')) {
        if (e.key === 'Escape') closeQuestionForm();
        return;
      }
      if (DOM.modalConfirmDeleteQ && DOM.modalConfirmDeleteQ.classList.contains('open')) {
        if (e.key === 'Escape') closeDeleteConfirm();
        return;
      }

      if (state.currentScreen !== 'exam') return;

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

  // --- 23. INITIALIZATION & SECURITY GATE ---

  function sha256Fallback(ascii) {
    function rightRotate(value, amount) {
      return (value >>> amount) | (value << (32 - amount));
    }
    const mathPow = Math.pow;
    const maxWord = mathPow(2, 32);
    const lengthProperty = 'length';
    let i, j;
    let result = '';
    const words = [];
    const asciiBitLength = ascii[lengthProperty] * 8;
    let hash = sha256Fallback.h = sha256Fallback.h || [];
    const k = sha256Fallback.k = sha256Fallback.k || [];
    let primeCounter = k[lengthProperty];
    const isComposite = {};
    for (let candidate = 2; primeCounter < 64; candidate++) {
      if (!isComposite[candidate]) {
        for (i = 0; i < 313; i += candidate) isComposite[i] = candidate;
        hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
        k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
      }
    }
    ascii += '\x80';
    while (ascii[lengthProperty] % 64 - 56) ascii += '\x00';
    for (i = 0; i < ascii[lengthProperty]; i++) {
      j = ascii.charCodeAt(i);
      if (j >> 8) return;
      words[i >> 2] |= j << ((3 - i) % 4) * 8;
    }
    words[words[lengthProperty]] = ((asciiBitLength / maxWord) | 0);
    words[words[lengthProperty]] = (asciiBitLength);
    for (j = 0; j < words[lengthProperty];) {
      const w = words.slice(j, j += 16);
      const oldHash = hash;
      hash = hash.slice(0, 8);
      for (i = 0; i < 64; i++) {
        const w15 = w[i - 15], w2 = w[i - 2];
        const a = hash[0], e = hash[4];
        const temp1 = hash[7]
          + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25))
          + ((e & hash[5]) ^ ((~e) & hash[6]))
          + k[i]
          + (w[i] = (i < 16) ? w[i] : (
            w[i - 16]
            + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3))
            + w[i - 7]
            + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))
          ) | 0);
        const temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22))
          + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
        hash = [(temp1 + temp2) | 0].concat(hash);
        hash[4] = (hash[4] + temp1) | 0;
      }
      for (i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
    }
    for (i = 0; i < 8; i++) {
      for (j = 3; j + 1; j--) {
        const b = (hash[i] >> (j * 8)) & 255;
        result += ((b < 16) ? 0 : '') + b.toString(16);
      }
    }
    return result;
  }

  async function sha256(str) {
    if (window.crypto && window.crypto.subtle && typeof TextEncoder !== 'undefined') {
      try {
        const buf = new TextEncoder().encode(str);
        const hashBuf = await window.crypto.subtle.digest('SHA-256', buf);
        return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
      } catch (e) {
        // Fallback to pure-JS SHA-256 (e.g. insecure file:// context)
      }
    }
    const utf8 = unescape(encodeURIComponent(str));
    return sha256Fallback(utf8);
  }

  function initAuthGate() {
    if (!DOM.authGateScreen || !DOM.authGateForm) return;

    state.isAuthenticated = false;
    document.body.classList.add('auth-locked');
    DOM.authGateScreen.classList.remove('unlocked');

    // Detach protected DOM nodes from document.body until authenticated
    const detachedAppNodes = [];
    const protectedElements = Array.from(document.body.querySelectorAll('.cat-header, .app-screen, .modal-backdrop'));
    protectedElements.forEach((el) => {
      detachedAppNodes.push(el);
      if (el.parentNode) el.parentNode.removeChild(el);
    });

    const reattachAppNodes = () => {
      detachedAppNodes.forEach((el) => {
        if (!document.body.contains(el)) {
          document.body.appendChild(el);
        }
      });
    };

    // Anti-tampering MutationObserver while locked
    const gateObserver = new MutationObserver(() => {
      if (state.isAuthenticated) {
        gateObserver.disconnect();
        return;
      }
      if (!document.body.contains(DOM.authGateScreen)) {
        document.body.prepend(DOM.authGateScreen);
      }
      if (DOM.authGateScreen.classList.contains('unlocked')) {
        DOM.authGateScreen.classList.remove('unlocked');
      }
      if (!document.body.classList.contains('auth-locked')) {
        document.body.classList.add('auth-locked');
      }
    });
    gateObserver.observe(document.body, { childList: true, attributes: true, subtree: true });

    // Disable right-click & DevTools shortcuts while on Auth Gate
    const blockContextMenu = (e) => {
      if (!state.isAuthenticated) e.preventDefault();
    };
    const blockDevToolsKeys = (e) => {
      if (state.isAuthenticated) return;
      if (
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && ['I', 'i', 'J', 'j', 'C', 'c'].includes(e.key)) ||
        (e.ctrlKey && ['U', 'u'].includes(e.key))
      ) {
        e.preventDefault();
      }
    };
    document.addEventListener('contextmenu', blockContextMenu);
    document.addEventListener('keydown', blockDevToolsKeys);

    // Rate Limiter State (Server-Side enforced when http/https, localStorage fallback for file://)
    let cooldownInterval = null;
    let isServerEnforced = false;

    const getRateLimit = () => {
      try {
        const raw = localStorage.getItem(CONFIG.RATE_LIMIT_KEY);
        return raw ? JSON.parse(raw) : { failCount: 0, lockoutUntil: 0 };
      } catch (e) {
        return { failCount: 0, lockoutUntil: 0 };
      }
    };
    const setRateLimit = (data) => {
      try {
        localStorage.setItem(CONFIG.RATE_LIMIT_KEY, JSON.stringify(data));
      } catch (e) {}
    };

    const startCooldownUI = (lockoutUntil, useServerCheck = false) => {
      if (cooldownInterval) clearInterval(cooldownInterval);
      if (DOM.authPasswordInput) DOM.authPasswordInput.disabled = true;
      if (DOM.btnAuthSubmit) DOM.btnAuthSubmit.disabled = true;

      const tick = async () => {
        const remainingMs = lockoutUntil - Date.now();
        if (remainingMs <= 0) {
          clearInterval(cooldownInterval);
          cooldownInterval = null;
          if (useServerCheck) {
            try {
              const resp = await fetch('/api/auth-status');
              if (resp.ok) {
                const st = await resp.json();
                if (st.locked && st.lockoutSeconds > 0) {
                  startCooldownUI(Date.now() + st.lockoutSeconds * 1000, true);
                  return;
                }
              }
            } catch (e) {}
          } else {
            setRateLimit({ failCount: 0, lockoutUntil: 0 });
          }
          if (DOM.authPasswordInput) {
            DOM.authPasswordInput.disabled = false;
            DOM.authPasswordInput.value = '';
          }
          if (DOM.btnAuthSubmit) DOM.btnAuthSubmit.disabled = false;
          if (DOM.authErrorMsg) DOM.authErrorMsg.style.display = 'none';
          return;
        }
        const totalSec = Math.ceil(remainingMs / 1000);
        const mins = String(Math.floor(totalSec / 60)).padStart(2, '0');
        const secs = String(totalSec % 60).padStart(2, '0');
        if (DOM.authErrorMsg) {
          DOM.authErrorMsg.textContent = `Terlalu banyak percobaan salah (5x). Coba lagi dalam ${mins}:${secs}`;
          DOM.authErrorMsg.style.display = 'block';
        }
      };
      tick();
      cooldownInterval = setInterval(tick, 1000);
    };

    // Check Server-Side Rate Limiter ONLY if localStorage recorded prior failure/lockout (saves Vercel invocations)
    const checkInitialAuthStatus = async () => {
      const initialRL = getRateLimit();
      if ((initialRL.failCount > 0 || initialRL.lockoutUntil > 0) &&
          (window.location.protocol === 'http:' || window.location.protocol === 'https:')) {
        try {
          const resp = await fetch('/api/auth-status');
          if (resp.ok) {
            const data = await resp.json();
            if (data && data.serverEnforced) {
              isServerEnforced = true;
              if (data.locked && data.lockoutSeconds > 0) {
                startCooldownUI(Date.now() + data.lockoutSeconds * 1000, true);
              }
              return;
            }
          }
        } catch (e) {}
      }
      // Fallback to localStorage
      if (initialRL.lockoutUntil && initialRL.lockoutUntil > Date.now()) {
        startCooldownUI(initialRL.lockoutUntil, false);
      }
    };
    checkInitialAuthStatus();

    if (DOM.btnTogglePassword && DOM.authPasswordInput) {
      DOM.btnTogglePassword.addEventListener('click', () => {
        const isPassword = DOM.authPasswordInput.type === 'password';
        DOM.authPasswordInput.type = isPassword ? 'text' : 'password';
        if (DOM.iconEyeShow) DOM.iconEyeShow.style.display = isPassword ? 'none' : 'block';
        if (DOM.iconEyeHide) DOM.iconEyeHide.style.display = isPassword ? 'block' : 'none';
      });
    }

    if (DOM.authPasswordInput && DOM.authErrorMsg) {
      DOM.authPasswordInput.addEventListener('input', () => {
        const rl = getRateLimit();
        if (!rl.lockoutUntil || rl.lockoutUntil <= Date.now()) {
          DOM.authErrorMsg.style.display = 'none';
        }
      });
    }

    DOM.authGateForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const entered = DOM.authPasswordInput ? DOM.authPasswordInput.value : '';
      const computedHash = await sha256(CONFIG.AUTH_SALT + entered);

      const unlockSuccess = () => {
        state.isAuthenticated = true;
        gateObserver.disconnect();
        document.removeEventListener('contextmenu', blockContextMenu);
        document.removeEventListener('keydown', blockDevToolsKeys);
        setRateLimit({ failCount: 0, lockoutUntil: 0 });
        if (cooldownInterval) clearInterval(cooldownInterval);

        reattachAppNodes();
        document.body.classList.remove('auth-locked');
        DOM.authGateScreen.classList.add('unlocked');
        if (DOM.authErrorMsg) DOM.authErrorMsg.style.display = 'none';
      };

      // Try Server-Side Auth if http/https
      if (isServerEnforced || window.location.protocol === 'http:' || window.location.protocol === 'https:') {
        try {
          const resp = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hash: computedHash })
          });
          const resData = await resp.json();
          if (resp.ok && resData.ok) {
            unlockSuccess();
            return;
          }
          if (resp.status === 429 || resData.locked) {
            startCooldownUI(Date.now() + (resData.lockoutSeconds || 300) * 1000, true);
            return;
          }
          if (resp.status === 401) {
            const rem = resData.remainingAttempts !== undefined ? resData.remainingAttempts : 0;
            if (DOM.authErrorMsg) {
              DOM.authErrorMsg.textContent = `Password salah! Sisa percobaan: ${rem}x`;
              DOM.authErrorMsg.style.display = 'block';
            }
            if (DOM.authPasswordInput) {
              DOM.authPasswordInput.focus();
              DOM.authPasswordInput.select();
            }
            return;
          }
        } catch (err) {
          // Fallback to client-side if server endpoint unavailable
        }
      }

      // Client-side fallback (file://)
      const rl = getRateLimit();
      if (rl.lockoutUntil && rl.lockoutUntil > Date.now()) {
        startCooldownUI(rl.lockoutUntil, false);
        return;
      }

      if (computedHash === CONFIG.AUTH_HASH) {
        unlockSuccess();
      } else {
        const nextFail = (rl.failCount || 0) + 1;
        if (nextFail >= 5) {
          const lockoutUntil = Date.now() + 5 * 60 * 1000;
          setRateLimit({ failCount: nextFail, lockoutUntil });
          startCooldownUI(lockoutUntil, false);
        } else {
          setRateLimit({ failCount: nextFail, lockoutUntil: 0 });
          const remaining = 5 - nextFail;
          if (DOM.authErrorMsg) {
            DOM.authErrorMsg.textContent = `Password salah! Sisa percobaan: ${remaining}x`;
            DOM.authErrorMsg.style.display = 'block';
          }
          if (DOM.authPasswordInput) {
            DOM.authPasswordInput.focus();
            DOM.authPasswordInput.select();
          }
        }
      }
    });
  }

  async function initializeApp() {

    initAuthGate();
    initEventListeners();

    // Inisialisasi Database SQLite JS (WASM) & IndexedDB Persistence
    await initSQLiteEngine();

    // Load active questions from SQLite (or fallback to questions.js)
    await loadActiveQuestions();

    const hasPrevious = loadActiveExamState();

    if (state.fontSize) {
      document.body.classList.remove('font-sm', 'font-md', 'font-lg');
      document.body.classList.add(state.fontSize);
      if (DOM.btnFontDec) DOM.btnFontDec.classList.toggle('active', state.fontSize === 'font-sm');
      if (DOM.btnFontReset) DOM.btnFontReset.classList.toggle('active', state.fontSize === 'font-md');
      if (DOM.btnFontInc) DOM.btnFontInc.classList.toggle('active', state.fontSize === 'font-lg');
    }

    if (DOM.candidateAvatar) DOM.candidateAvatar.textContent = 'ASN';

    // Resume exam if reload occurred during active simulation
    if (hasPrevious && state.mode === 'simulasi' && !state.isFinished && state.timeRemaining > 0) {
      showScreen('exam');
      document.body.classList.add('simulation-mode-active');
      if (DOM.badgeSimLocked) DOM.badgeSimLocked.style.display = 'inline-flex';
      if (DOM.timerBox) DOM.timerBox.style.display = 'flex';
      if (DOM.btnFinishExam) DOM.btnFinishExam.style.display = 'inline-flex';
      startTimer();
      renderCurrentQuestion();
    } else {
      showScreen('landing');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
  } else {
    initializeApp();
  }

})();
