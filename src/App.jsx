import React, { useState, useEffect, useCallback } from 'react';
import { 
  Volume2, 
  RotateCcw, 
  Import, 
  CheckCircle2, 
  Clock, 
  RefreshCw,
  ChevronRight,
  Settings2,
  Trash2,
  Play
} from 'lucide-react';

/**
 * 洗牌算法 - Fisher-Yates
 */
const shuffleArray = (array) => {
  const newArr = [...array];
  for (let i = newArr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
  }
  return newArr;
};

/**
 * 振假名解析引擎
 * 兼容两种 AI 标注风格：
 *   1) 美味[おい]しい  —— 送り仮名写在括号外（标准）
 *   2) 美味しい[おいしい] —— 送り仮名被写进了括号前（常见的 AI 不规范标注）
 * 解析时把 base 首尾的假名剥离成普通文本，读音也削去对应的首尾假名，
 * 保证注音只精准压在中间的汉字核心上。
 */
const parseFurigana = (text) => {
  if (!text) return [];

  // 汉字（含扩展A、兼容区、々〆〇）。其余视为假名/普通字符。
  const KANJI = '\\u3005\\u3006\\u3007\\u4e00-\\u9fff\\u3400-\\u4dbf\\uf900-\\ufaff';
  const kanjiRe = new RegExp(`[${KANJI}]`);
  // 宽松捕获：括号前紧邻的一段“非括号、非空白、非分隔符”的词。
  const regex = /([^\s\[\]，,｜|]+)\[([^\[\]]+)\]/g;

  const isKana = (ch) => !kanjiRe.test(ch) && /[\u3040-\u30ff\u31f0-\u31ff\uff66-\uff9f]/.test(ch);

  const parts = [];
  let lastIndex = 0;
  let match;

  const pushText = (s) => { if (s) parts.push({ type: 'text', content: s }); };

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      pushText(text.substring(lastIndex, match.index));
    }

    let base = match[1];
    let reading = match[2];

    // 1) 剥离 base 开头的假名前缀
    let prefix = '';
    while (base.length && isKana(base[0])) {
      prefix += base[0];
      base = base.slice(1);
    }
    if (prefix && reading.startsWith(prefix)) {
      reading = reading.slice(prefix.length);
    }

    // 2) 剥离 base 末尾的送り仮名后缀
    let suffix = '';
    while (base.length && isKana(base[base.length - 1])) {
      suffix = base[base.length - 1] + suffix;
      base = base.slice(0, -1);
    }
    if (suffix && reading.endsWith(suffix)) {
      reading = reading.slice(0, reading.length - suffix.length);
    }

    pushText(prefix);

    if (base && reading) {
      parts.push({ type: 'ruby', base, rt: reading });
    } else {
      pushText(base);
    }

    pushText(suffix);

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    pushText(text.substring(lastIndex));
  }

  return parts.length > 0 ? parts : [{ type: 'text', content: text }];
};

/**
 * 过滤 TTS 文本 (移除方括号内容)
 */
const cleanForTTS = (text) => text.replace(/\[.*?\]/g, '');

const App = () => {
  // --- 状态管理 ---
  const [deck, setDeck] = useState([]);
  const [queue, setQueue] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isImporting, setIsImporting] = useState(true);
  const [importText, setImportText] = useState('');
  const [isAnimating, setIsAnimating] = useState(false);
  const [speechRate, setSpeechRate] = useState(0.9);

  // --- 本地持久化缓存：加载 ---
  useEffect(() => {
    const savedText = localStorage.getItem('news_flashcard_import');
    if (savedText) {
      setImportText(savedText);
    }
  }, []);

  // --- 朗读功能 ---
  const speak = useCallback((text) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(cleanForTTS(text));
    utterance.lang = 'ja-JP';
    utterance.rate = speechRate;
    window.speechSynthesis.speak(utterance);
  }, [speechRate]);

  // --- 导入逻辑 ---
  const handleImport = () => {
    if (!importText.trim()) return;
    localStorage.setItem('news_flashcard_import', importText);

    const lines = importText.split('\n').filter(line => line.trim());
    const rawCards = lines.map((line, index) => {
      const parts = line.split(/[|｜]/);
      return {
        id: `news-${Date.now()}-${index}`,
        ja: parts[0]?.trim() || '',
        zh: parts[1]?.trim() || '无翻译内容'
      };
    }).filter(c => c.ja);

    const shuffled = shuffleArray(rawCards);
    setDeck(shuffled);
    setQueue([...shuffled]);
    setCurrentIndex(0);
    setIsImporting(false);
  };

  // --- 学习逻辑：重温与记住 ---
  const nextCard = (action) => {
    if (isAnimating) return;
    setIsAnimating(true);
    setIsFlipped(false); 

    setTimeout(() => {
      const currentCard = queue[currentIndex];
      let newQueue = [...queue];

      if (action === 'review') {
        // 重温：隔 5 张后重新出现
        newQueue.splice(currentIndex + 6, 0, { ...currentCard });
      }

      setQueue(newQueue);
      setCurrentIndex(prev => prev + 1);
      setIsAnimating(false);
    }, 450); 
  };

  const restart = () => {
    setQueue(shuffleArray(deck));
    setCurrentIndex(0);
    setIsFlipped(false);
    setIsImporting(false);
  };

  // --- 修复后的清空逻辑 ---
  const clearAll = () => {
    setIsImporting(true);
    setDeck([]);
    setQueue([]);
    setCurrentIndex(0);
    setImportText('');
    localStorage.removeItem('news_flashcard_import');
    setIsFlipped(false);
  };

  // --- 渲染组件：振假名文字 ---
  const RubyText = ({ text, className, rtColor = "text-indigo-500" }) => {
    const parts = parseFurigana(text);
    return (
      <span className={className}>
        {parts.map((part, i) => (
          part.type === 'ruby' ? (
            <ruby key={i} className="ruby-wrap">
              {part.base}
              <rt className={`${rtColor} font-bold`}>{part.rt}</rt>
            </ruby>
          ) : <span key={i}>{part.content}</span>
        ))}
      </span>
    );
  };

  const isFinished = currentIndex >= queue.length && queue.length > 0;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-indigo-100 flex flex-col items-center justify-center p-4 md:p-8">
      
      {/* 顶部工具栏 */}
      {!isImporting && (
        <div className="fixed top-4 right-4 flex gap-2 z-50">
          <button 
            onClick={clearAll}
            className="p-3 bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-500 rounded-full shadow-md border border-slate-200 transition-all flex items-center gap-2 group active:scale-95"
            title="清空并重置"
          >
            <Trash2 size={18} />
          </button>
          <button 
            onClick={() => setIsImporting(true)}
            className="p-3 bg-white hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 rounded-full shadow-md border border-slate-200 transition-all flex items-center gap-2 group active:scale-95"
            title="编辑内容"
          >
            <Settings2 size={18} />
          </button>
        </div>
      )}

      {/* 导入界面 */}
      {isImporting && (
        <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl p-6 md:p-10 animate-in fade-in zoom-in duration-300 border border-slate-100">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-indigo-600 text-white rounded-2xl shadow-lg">
              <Play size={24} />
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-slate-800">日语新闻短句学习</h2>
              <p className="text-sm text-slate-500">格式：日语[读音]原文 | 中文翻译</p>
            </div>
          </div>
          <textarea
            className="w-full h-80 p-5 rounded-2xl border border-slate-200 bg-slate-50 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all font-mono text-sm mb-6 resize-none shadow-inner"
            placeholder="警視庁[けいしちょう]から指名手配[しめいてはい]されています。 | 該名嫌犯已被警視廳發布通緝&#10;インフレの影響[えいきょう]で物価[ぶっか]が上昇[じょうしょう]している。 | 受通膨影响物价正在上涨。"
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
          />
          <button
            onClick={handleImport}
            disabled={!importText.trim()}
            className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-2xl font-bold transition-all shadow-xl shadow-indigo-100 flex items-center justify-center gap-2"
          >
            开始学习 (随机乱序) <ChevronRight size={20} />
          </button>
        </div>
      )}

      {/* 学习界面 */}
      {!isImporting && !isFinished && (
        <div className="w-full flex flex-col items-center">
          {/* 进度指示 */}
          <div className="w-full max-w-lg mb-8 flex items-center gap-4 px-2">
            <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-indigo-500 transition-all duration-700 ease-out"
                style={{ width: `${(currentIndex / queue.length) * 100}%` }}
              />
            </div>
            <span className="text-slate-400 text-[10px] font-black w-16 text-right tabular-nums">
              {currentIndex + 1} / {queue.length}
            </span>
          </div>

          {/* 3D 句子卡片 */}
          <div className="w-full max-w-xl news-card-perspective">
            <div 
              className={`news-card-container ${isFlipped ? 'is-flipped' : ''}`}
              onClick={() => !isAnimating && setIsFlipped(!isFlipped)}
            >
              {/* 正面 (日语 + 振假名) */}
              <div className="news-card-face face-front bg-white border border-slate-200 shadow-xl rounded-[2.5rem] p-8 flex flex-col items-center justify-center">
                <div className="flex-1 flex items-center justify-center w-full">
                  <div className="text-xl md:text-2xl font-semibold leading-relaxed text-slate-800 text-center break-words px-4">
                    <RubyText text={queue[currentIndex].ja} />
                  </div>
                </div>
                
                {/* 朗读控制 */}
                <div className="flex flex-col items-center gap-4 mb-2 w-full">
                  <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
                    <button 
                      onClick={(e) => { e.stopPropagation(); setSpeechRate(0.9); }}
                      className={`px-4 py-1.5 text-[10px] font-bold rounded-lg transition-all ${speechRate === 0.9 ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                      标准速度
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); setSpeechRate(0.5); }}
                      className={`px-4 py-1.5 text-[10px] font-bold rounded-lg transition-all ${speechRate === 0.5 ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                      慢速精听
                    </button>
                  </div>
                  <button 
                    onClick={(e) => { e.stopPropagation(); speak(queue[currentIndex].ja); }}
                    className="p-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full transition-all shadow-lg active:scale-90 flex items-center gap-2"
                  >
                    <Volume2 size={24} />
                  </button>
                </div>
              </div>

              {/* 背面 (中文) */}
              <div className="news-card-face face-back bg-indigo-700 border-4 border-indigo-500 shadow-xl rounded-[2.5rem] p-8 flex flex-col items-center justify-center text-white">
                <div className="flex-1 flex items-center justify-center w-full">
                  <p className="text-lg md:text-xl font-medium leading-relaxed text-center px-4">
                    {queue[currentIndex].zh}
                  </p>
                </div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-indigo-300 mb-4 opacity-60 text-center">Translation</div>
              </div>
            </div>
          </div>

          {/* 纯净反馈按钮 */}
          <div className={`mt-12 grid grid-cols-2 gap-6 w-full max-w-lg transition-all duration-500 ${!isFlipped ? 'opacity-0 translate-y-10 pointer-events-none' : 'opacity-100 translate-y-0'}`}>
            <button 
              onClick={() => nextCard('review')}
              className="group flex items-center justify-center gap-3 py-5 bg-white hover:bg-amber-50 border border-slate-200 rounded-3xl transition-all shadow-md active:scale-95"
            >
              <Clock className="text-amber-500" size={24} />
              <span className="text-base font-bold text-slate-700 text-center">重温一次</span>
            </button>
            <button 
              onClick={() => nextCard('remembered')}
              className="group flex items-center justify-center gap-3 py-5 bg-indigo-600 hover:bg-indigo-700 text-white border-b-4 border-indigo-800 rounded-3xl transition-all shadow-lg active:scale-95"
            >
              <CheckCircle2 size={24} />
              <span className="text-base font-bold text-center">记住了</span>
            </button>
          </div>
        </div>
      )}

      {/* 结算界面 */}
      {isFinished && (
        <div className="w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl p-10 text-center animate-in fade-in zoom-in border border-slate-100">
          <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
            <CheckCircle2 size={40} />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2 tracking-tight">学习完成！</h2>
          <p className="text-slate-500 mb-8 text-sm">当前的短句列表已全部掌握。</p>
          <div className="flex flex-col gap-3">
            <button
              onClick={restart}
              className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold transition-all shadow-lg flex items-center justify-center gap-2"
            >
              <RotateCcw size={18} /> 重新随机挑战
            </button>
            <button
              onClick={() => setIsImporting(true)}
              className="w-full py-4 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl font-bold transition-all"
            >
              导入新内容
            </button>
          </div>
        </div>
      )}

      <style>{`
        .news-card-perspective {
          perspective: 2000px;
          height: 400px;
          width: 100%;
        }
        @media (min-width: 768px) {
          .news-card-perspective {
            height: 380px;
          }
        }
        .news-card-container {
          position: relative;
          width: 100%;
          height: 100%;
          transition: transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
          transform-style: preserve-3d;
          cursor: pointer;
        }
        .is-flipped {
          transform: rotateY(180deg);
        }
        .news-card-face {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
          display: flex;
          flex-direction: column;
          z-index: 1;
        }
        .face-front {
          transform: rotateY(0deg);
        }
        .face-back {
          transform: rotateY(180deg);
        }
        rt {
          ruby-position: over;
          ruby-align: center;
          font-size: 0.5em;
          line-height: 1;
          transform: translateY(-0.15em);
          letter-spacing: -0.02em;
        }
        .ruby-wrap {
          ruby-align: center;
          margin-inline: 0.02em;
        }
        @supports (-moz-appearance: none) {
          rt {
            transform: translateY(-0.05em);
          }
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
};

export default App;
