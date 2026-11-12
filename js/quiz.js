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

let eligibleSongs = [];
let questionSongs = [];
let questionPool = [];

let currentQuestion = null;
let selectedChoiceId = null;

let answered = false;

let correctCount = 0;
let missCount = 0;
let questionCount = 0;
const MAX_QUESTIONS = 10;

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
// 次の問題を表示
// ========================================

async function showNextQuestion() {

  if (missCount >= 3) {

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
  document.getElementById("questionCount").textContent = questionCount;

  answerButton.hidden = false;
  answerButton.disabled = true;

  nextButton.hidden = true;

  feedback.textContent = "";
  feedback.className = "feedback";

  choicesElement.innerHTML = "";

  loadingPanel.hidden = false;
  questionPanel.hidden = true;

  loadingText.textContent = "サムネイルを読み込んでいます...";


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

    if (questionSongs.length === 0) {

      showError("読み込み可能なサムネイル画像がありません。");
      return;

    }

    if (questionPool.length === 0) {

      questionPool = shuffled(questionSongs);

    }

    await showNextQuestion();

    return;

  }


  // サムネイルの一部をランダム公開
  const revealedIndexes = pickRevealedIndexes();

  makeTileGrid(
    currentQuestion.thumbnailUrl,
    revealedIndexes
  );


  // 4択を作成
  let questionChoices;

  try {

    questionChoices = getQuestionChoices(currentQuestion);

  } catch (error) {

    showError(error.message);
    return;

  }


  // 選択肢を画面に表示
  questionChoices.forEach(choice => {

    const button = document.createElement("button");

    button.type = "button";

    button.className = "choice-button";

    button.textContent = choice.title;

    button.dataset.choiceId = choice.id;

    button.addEventListener("click", () => {
      selectChoice(choice.id);
    });

    choicesElement.appendChild(button);

  });


  document.getElementById("questionNumber").textContent =
    `QUESTION ${questionCount}`;

  document.getElementById("correctCount").textContent =
    correctCount;

  document.getElementById("missCount").textContent =
    missCount;


  loadingPanel.hidden = true;
  questionPanel.hidden = false;
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
}


// ========================================
// 結果画面
// ========================================

function showResult() {

  questionPanel.hidden = true;
  loadingPanel.hidden = true;

  resultPanel.hidden = false;

  document.getElementById("finalScore").textContent =
    correctCount;

  document.getElementById("resultMessage").textContent =
    `全${questionCount}問中、${correctCount}問正解でした。`;

}


// ========================================
// エラー表示
// ========================================

function showError(message) {

  loadingPanel.hidden = false;
  questionPanel.hidden = true;

  loadingText.textContent = message;

}


// ========================================
// ゲーム開始・リトライ
// ========================================

async function startGame() {

  loadingPanel.hidden = false;
  questionPanel.hidden = true;
  resultPanel.hidden = true;

  loadingText.textContent = "楽曲データを読み込んでいます...";


  correctCount = 0;
  missCount = 0;
  questionCount = 0;

  currentQuestion = null;
  selectedChoiceId = null;

  answered = false;


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
  startGame
);


// ページ読み込み時にゲーム開始
startGame();