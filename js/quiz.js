// ========================================
// 基本設定
// ========================================

const START_YEAR = 2007;
const END_YEAR = 2025;

const loadingPanel = document.getElementById("loadingPanel");
const loadingText = document.getElementById("loadingText");

const questionPanel = document.getElementById("questionPanel");
const resultPanel = document.getElementById("resultPanel");

const thumbnailGrid = document.getElementById("thumbnailGrid");
const thumbnailImage = document.getElementById("thumbnailImage");
const choicesElement = document.getElementById("choices");

const answerButton = document.getElementById("answerButton");
const nextButton = document.getElementById("nextButton");

const feedback = document.getElementById("feedback");

const scoreBoard = document.getElementById("scoreboard");
const textLink = document.getElementById("text-link");
const shareXButton = document.getElementById("shareXButton");

let eligibleSongs = [];
let questionSongs = [];
let questionPool = [];

let currentQuestion = null;
let selectedChoiceId = null;

let answered = false;

let correctCount = 0;
let missCount = 0;
let questionCount = 0;
const MAX_QUESTIONS = 100;





// ========================================
// 再読み込み時の状態保存
// ========================================

const SAVE_KEY = "vocaloidQuizSave";

let currentChoices = [];
let revealedIndexes = [];

// ========================================
// ゲーム状態の保存・読み込み
// ========================================

function saveGame() {
  const saveData = {
    version: 1,

    correctCount,
    missCount,
    questionCount,

    currentQuestionId: currentQuestion
      ? String(currentQuestion.vocadbId)
      : null,

    questionPoolIds: questionPool.map(song =>
      String(song.vocadbId)
    ),

    selectedChoiceId,
    answered,

    currentChoices,
    revealedIndexes
  };

  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));
  } catch (error) {
    console.warn("ゲーム状態を保存できませんでした。", error);
  }
}


function loadGame() {
  try {
    const data = localStorage.getItem(SAVE_KEY);

    if (!data) return null;

    const saveData = JSON.parse(data);

    if (
      saveData.version !== 1 ||
      !saveData.currentQuestionId ||
      !Array.isArray(saveData.questionPoolIds) ||
      !Array.isArray(saveData.currentChoices) ||
      saveData.currentChoices.length !== 4 ||
      !Array.isArray(saveData.revealedIndexes)
    ) {
      return null;
    }

    return saveData;

  } catch (error) {
    console.warn("保存データを読み込めませんでした。", error);
    return null;
  }
}


function clearGameSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (error) {
    console.warn("保存データを削除できませんでした。", error);
  }
}





// ========================================
// 配列をランダムに並び替える
// ========================================

function shuffled(array) {
  const result = [...array];

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));

    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}


// ========================================
// JSONデータ読み込み
// ========================================

async function loadAllSongs() {

  const requests = [];

  for (let year = START_YEAR; year <= END_YEAR; year++) {

    const path = `vocaloid_data/songs_${year}.json`;

    requests.push(
      fetch(path)
        .then(response => {

          if (!response.ok) {
            throw new Error(`${path} の読み込みに失敗しました`);
          }

          return response.json();
        })
        .then(data => {

          if (!Array.isArray(data)) {
            throw new Error(`${path} の形式が正しくありません`);
          }

          return data;
        })
    );
  }

  // すべての年のJSONを読み込む
  const results = await Promise.allSettled(requests);

  const all = [];

  results.forEach((result, index) => {

    if (result.status === "fulfilled") {

      all.push(...result.value);

    } else {

      console.warn(
        `${START_YEAR + index}年のデータを読み込めませんでした`,
        result.reason
      );

    }
  });

  if (all.length === 0) {
    throw new Error("楽曲データを読み込めませんでした。");
  }


  // ========================================
  // selected:true の曲だけに絞る
  // ========================================

  const filtered = all.filter(song => {

    return (
      song &&
      song.selected === true &&
      song.vocadbId !== undefined &&
      song.vocadbId !== null &&
      typeof song.title === "string" &&
      song.title.trim() !== ""
    );

  });


  // VocaDB IDで重複を除去
  const uniqueById = new Map();

  filtered.forEach(song => {

    const key = String(song.vocadbId);

    if (!uniqueById.has(key)) {
      uniqueById.set(key, song);
    }

  });

  return [...uniqueById.values()];
}


// ========================================
// サムネイル画像の読み込み
// ========================================

function preloadImage(url) {

  return new Promise((resolve, reject) => {

    const image = new Image();

    image.onload = () => resolve(image);

    image.onerror = () => {
      reject(new Error("サムネイル画像を読み込めませんでした。"));
    };

    image.src = url;

  });
}


// ========================================
// サムネイル12分割表示
// ========================================

function makeTileGrid(imageUrl, revealedIndexes) {
  // サムネイル画像を設定
  thumbnailImage.src = imageUrl;

  // タイルを初期化
  thumbnailGrid.innerHTML = "";

  // 12枚のタイルを生成
  for (let index = 0; index < 12; index++) {
    const tile = document.createElement("div");

    tile.className = "thumbnail-tile";

    // 最初から公開するタイルは非表示にする
    if (revealedIndexes.includes(index)) {
      tile.classList.add("is-hidden");
    }

    thumbnailGrid.appendChild(tile);
  }
}

// ========================================
// 回答後にサムネイル全体を公開
// ========================================

function revealWholeThumbnail() {
  const tiles = thumbnailGrid.querySelectorAll(".thumbnail-tile");

  tiles.forEach(tile => {
    tile.classList.add("is-hidden");
  });
}


// ========================================
// 公開するマス数をランダム決定
// ========================================

function pickRevealedIndexes() {

  const roll = Math.random();

  let count;

  if (roll < 0.5) {

    count = 1;

  } else if (roll < 0.8) {

    count = 2;

  } else {

    count = 3;

  }

  return shuffled([...Array(12).keys()]).slice(0, count);
}


// ========================================
// 4択の選択肢を作成
// ========================================

function getQuestionChoices(correctSong) {

  // 正解曲と同じID・同じ曲名は除外
  const distractors = shuffled(
    eligibleSongs.filter(song => {

      return (
        String(song.vocadbId) !== String(correctSong.vocadbId) &&
        song.title.trim() !== correctSong.title.trim()
      );

    })
  );

  // 選択肢の曲名重複も防止
  const uniqueDistractors = [];
  const usedTitles = new Set([correctSong.title.trim()]);

  for (const song of distractors) {

    const title = song.title.trim();

    if (!usedTitles.has(title)) {

      usedTitles.add(title);
      uniqueDistractors.push(song);

    }

    if (uniqueDistractors.length === 3) {
      break;
    }
  }

  if (uniqueDistractors.length < 3) {

    throw new Error(
      "4択を作成できません。selected:true の曲名が4種類以上必要です。"
    );

  }

  const choices = [
    correctSong,
    ...uniqueDistractors
  ];

  return shuffled(choices).map(song => ({

    id: String(song.vocadbId),

    title: song.title.trim(),

    isCorrect:
      String(song.vocadbId) === String(correctSong.vocadbId)

  }));
}


// ========================================
// 選択肢を画面に表示
// ========================================

function renderChoices() {
  choicesElement.innerHTML = "";

  currentChoices.forEach(choice => {
    const button = document.createElement("button");

    button.type = "button";
    button.className = "choice-button";
    button.textContent = choice.title;
    button.dataset.choiceId = choice.id;

    button.addEventListener("click", () => {
      selectChoice(choice.id);
    });

    if (selectedChoiceId === choice.id) {
      button.classList.add("selected");
    }

    if (answered) {
      button.disabled = true;

      if (choice.id === String(currentQuestion.vocadbId)) {
        button.classList.add("correct-answer");
      }

      if (
        choice.id === selectedChoiceId &&
        choice.id !== String(currentQuestion.vocadbId)
      ) {
        button.classList.add("wrong-answer");
      }
    }

    choicesElement.appendChild(button);
  });
}




// ========================================
// 次の問題を表示
// ========================================

async function showNextQuestion() {

  if (missCount >= 3 || questionCount >= MAX_QUESTIONS) {
    showResult();
    return;
  }

  // 出題候補を一周したら再度シャッフル
  if (questionPool.length === 0) {
    questionPool = shuffled(questionSongs);
  }

  currentQuestion = questionPool.pop();

  selectedChoiceId = null;
  answered = false;

  questionCount++;

  document.getElementById("questionCount").textContent =
    questionCount;

  answerButton.hidden = false;
  answerButton.disabled = true;

  nextButton.hidden = true;

  feedback.textContent = "";
  feedback.className = "feedback";

  loadingPanel.hidden = false;
  questionPanel.hidden = true;

  loadingText.textContent = "サムネイルを読み込んでいます...";

  // 先に選択肢と公開タイルを決定する
  try {
    currentChoices = getQuestionChoices(currentQuestion);
  } catch (error) {
    showError(error.message);
    return;
  }

  revealedIndexes = pickRevealedIndexes();

  // 画像読み込み前に保存
  saveGame();

  // 現在の問題の画像だけ読み込む
  try {
    await preloadImage(currentQuestion.thumbnailUrl);

  } catch (error) {
    console.warn(error);

    // 読み込めなかった画像は出題候補から除外
    questionSongs = questionSongs.filter(song =>
      String(song.vocadbId) !== String(currentQuestion.vocadbId)
    );

    questionPool = questionPool.filter(song =>
      String(song.vocadbId) !== String(currentQuestion.vocadbId)
    );

    // 画像エラーでは問題数を消費しない
    questionCount--;

    currentQuestion = null;
    currentChoices = [];
    revealedIndexes = [];

    if (questionSongs.length === 0) {
      clearGameSave();
      showError("読み込み可能なサムネイル画像がありません。");
      return;
    }

    if (questionPool.length === 0) {
      questionPool = shuffled(questionSongs);
    }

    await showNextQuestion();
    return;
  }

  // サムネイルを表示
  makeTileGrid(
    currentQuestion.thumbnailUrl,
    revealedIndexes
  );

  // 選択肢を表示
  renderChoices();

  document.getElementById("questionNumber").textContent =
    `QUESTION ${questionCount}`;

  document.getElementById("correctCount").textContent =
    correctCount;

  document.getElementById("missCount").textContent =
    missCount;

  loadingPanel.hidden = true;
  questionPanel.hidden = false;

  // 表示状態を保存
  saveGame();
}


// ========================================
// 選択肢を選ぶ
// ========================================

function selectChoice(choiceId) {

  if (answered) return;

  selectedChoiceId = choiceId;

  document.querySelectorAll(".choice-button").forEach(button => {

    button.classList.toggle(
      "selected",
      button.dataset.choiceId === choiceId
    );

  });

  answerButton.disabled = false;
  saveGame();
}


// ========================================
// 回答判定
// ========================================

function submitAnswer() {

  if (answered || selectedChoiceId === null) {
    return;
  }

  answered = true;

  const correctId = String(currentQuestion.vocadbId);

  const selectedButton = [
    ...document.querySelectorAll(".choice-button")
  ].find(button => button.dataset.choiceId === selectedChoiceId);

  const isCorrect = selectedChoiceId === correctId;


  if (isCorrect) {

    correctCount++;

    feedback.textContent = "正解！";
    feedback.classList.add("correct");

  } else {

    missCount++;

    feedback.textContent =
      `不正解！`;

    feedback.classList.add("incorrect");

    if (selectedButton) {
      selectedButton.classList.add("wrong-answer");
    }

  }


  // 正解の選択肢を緑色にする
  document.querySelectorAll(".choice-button").forEach(button => {

    button.disabled = true;

    if (button.dataset.choiceId === correctId) {

      button.classList.add("correct-answer");

    }

  });


  // サムネイル全体を公開
  revealWholeThumbnail();


  // スコア更新
  document.getElementById("correctCount").textContent =
    correctCount;

  document.getElementById("missCount").textContent =
    missCount;


  answerButton.hidden = true;

  nextButton.hidden = false;

  nextButton.textContent =
    missCount >= 3 || questionCount >= MAX_QUESTIONS
      ? "結果を見る"
      : "次の問題へ";

  saveGame();
}


// ========================================
// 結果画面
// ========================================

function showResult() {

  clearGameSave();

  questionPanel.hidden = true;
  loadingPanel.hidden = true;
  textLink.hidden = true;
  resultPanel.hidden = false;
  shareXButton.hidden = false;
  

  document.getElementById("finalScore").textContent =
    correctCount;

  document.getElementById("resultMessage").textContent =
    `全${questionCount}問中、${correctCount}問正解でした。`;

  

}

document.getElementById("shareXButton").addEventListener("click", () => {
  const text =
    `ボカロサムネ当てクイズに挑戦！\n` +
    `全${questionCount}問中、${correctCount}問正解でした！\n` +
    `https://kagi-web.github.io/vocaloid-quiz/\n` +
    `#ボカロサムネ当てクイズ`;

  const shareUrl =
    "https://twitter.com/intent/tweet?text=" + encodeURIComponent(text);

  window.open(shareUrl, "_blank", "noopener,noreferrer");
});



// ========================================
// エラー表示
// ========================================

function showError(message) {

  loadingPanel.hidden = false;
  questionPanel.hidden = true;

  loadingText.textContent = message;

}




// ========================================
// 保存されたゲーム状態を復元
// ========================================

async function restoreGame(saveData) {

  const songsById = new Map(
    questionSongs.map(song => [
      String(song.vocadbId),
      song
    ])
  );

  currentQuestion = songsById.get(
    String(saveData.currentQuestionId)
  );

  if (!currentQuestion) {
    return false;
  }

  questionPool = saveData.questionPoolIds
    .map(id => songsById.get(String(id)))
    .filter(Boolean);

  currentChoices = saveData.currentChoices.map(choice => ({
    id: String(choice.id),
    title: choice.title,
    isCorrect: Boolean(choice.isCorrect)
  }));

  const correctChoice = currentChoices.find(
    choice => choice.id === String(currentQuestion.vocadbId)
  );

  if (
    currentChoices.length !== 4 ||
    !correctChoice ||
    currentChoices.some(choice => typeof choice.title !== "string")
  ) {
    return false;
  }

  revealedIndexes = saveData.revealedIndexes.filter(
    index =>
      Number.isInteger(index) &&
      index >= 0 &&
      index < 12
  );

  correctCount = Number(saveData.correctCount) || 0;
  missCount = Number(saveData.missCount) || 0;
  questionCount = Number(saveData.questionCount) || 0;

  selectedChoiceId =
    saveData.selectedChoiceId === null
      ? null
      : String(saveData.selectedChoiceId);

  answered = Boolean(saveData.answered);

  // 回答済みなのに選択肢がない場合は復元しない
  if (answered && !selectedChoiceId) {
    return false;
  }

  // 現在の問題の画像を読み込む
  try {
    await preloadImage(currentQuestion.thumbnailUrl);

  } catch (error) {
    console.warn("保存された問題の画像を読み込めませんでした。", error);

    // 読み込めない曲は除外
    questionSongs = questionSongs.filter(song =>
      String(song.vocadbId) !== String(currentQuestion.vocadbId)
    );

    questionPool = questionPool.filter(song =>
      String(song.vocadbId) !== String(currentQuestion.vocadbId)
    );

    // この問題は消費しない
    questionCount--;

    currentQuestion = null;
    currentChoices = [];
    revealedIndexes = [];
    selectedChoiceId = null;
    answered = false;

    if (questionSongs.length === 0) {
      clearGameSave();
      showError("読み込み可能なサムネイル画像がありません。");
      return true;
    }

    if (questionPool.length === 0) {
      questionPool = shuffled(questionSongs);
    }

    await showNextQuestion();
    return true;
  }

  // サムネイルを復元
  makeTileGrid(
    currentQuestion.thumbnailUrl,
    revealedIndexes
  );

  // 回答済みならサムネイル全体を公開
  if (answered) {
    revealWholeThumbnail();
  }

  // 選択肢を復元
  renderChoices();

  // 問題数・スコアを復元
  document.getElementById("questionCount").textContent =
    questionCount;

  document.getElementById("questionNumber").textContent =
    `QUESTION ${questionCount}`;

  document.getElementById("correctCount").textContent =
    correctCount;

  document.getElementById("missCount").textContent =
    missCount;

  if (answered) {

    const isCorrect =
      selectedChoiceId === String(currentQuestion.vocadbId);

    feedback.textContent = isCorrect
      ? "正解！"
      : "不正解！";

    feedback.className = isCorrect
      ? "feedback correct"
      : "feedback incorrect";

    answerButton.hidden = true;
    nextButton.hidden = false;

    nextButton.textContent =
      missCount >= 3 || questionCount >= MAX_QUESTIONS
        ? "結果を見る"
        : "次の問題へ";

  } else {

    feedback.textContent = "";
    feedback.className = "feedback";

    answerButton.hidden = false;
    answerButton.disabled = selectedChoiceId === null;

    nextButton.hidden = true;
  }

  loadingPanel.hidden = true;
  questionPanel.hidden = false;

  saveGame();

  return true;
}




// ========================================
// ゲーム開始・リトライ
// ========================================

async function startGame(resume = false) {

  loadingPanel.hidden = false;
  questionPanel.hidden = true;
  textLink.hidden = false;
  resultPanel.hidden = true;
  shareXButton.hidden = true;

  loadingText.textContent = "楽曲データを読み込んでいます...";

  // 新規ゲームの場合は保存データを削除
  if (!resume) {
    clearGameSave();
  }

  correctCount = 0;
  missCount = 0;
  questionCount = 0;

  currentQuestion = null;
  selectedChoiceId = null;

  answered = false;

  currentChoices = [];
  revealedIndexes = [];

  try {

    // 全年のJSONを読み込む
    eligibleSongs = await loadAllSongs();

    // 正解として出題できる曲はサムネイル付きに限定
    questionSongs = eligibleSongs.filter(song => {

      return (
        typeof song.thumbnailUrl === "string" &&
        song.thumbnailUrl.trim() !== ""
      );

    });

    if (eligibleSongs.length < 4) {
      throw new Error(
        "selected:true の曲が4曲未満です。"
      );
    }

    if (questionSongs.length === 0) {
      throw new Error(
        "selected:true でサムネイル付きの曲がありません。"
      );
    }

    // 保存データがあれば復元を試みる
    if (resume) {

      const saveData = loadGame();

      if (saveData) {
        const restored = await restoreGame(saveData);

        if (restored) {
          return;
        }
      }

      // 復元できなかった場合は新規ゲームとして開始
      clearGameSave();

      correctCount = 0;
      missCount = 0;
      questionCount = 0;

      currentQuestion = null;
      selectedChoiceId = null;
      answered = false;

      currentChoices = [];
      revealedIndexes = [];
    }

    // 出題順をランダムにする
    questionPool = shuffled(questionSongs);

    document.getElementById("correctCount").textContent = 0;
    document.getElementById("missCount").textContent = 0;

    // 最初の問題を表示
    await showNextQuestion();

  } catch (error) {

    console.error(error);

    showError(
      error.message || "エラーが発生しました。"
    );

  }

}


// 次の問題かクイズ終了か========================================

answerButton.addEventListener("click", submitAnswer);

nextButton.addEventListener("click", () => {

  if (missCount >= 3 || questionCount >= MAX_QUESTIONS) {

    showResult();

  } else {

    showNextQuestion();

  }

});


document.getElementById("retryButton").addEventListener(
  "click",
  () => startGame(false)
);


// ページ読み込み時は保存データの復元を試みる
startGame(true);

