const startButton = document.getElementById("startButton");

// ゲームスタート
startButton.addEventListener("click", () => {
  localStorage.removeItem("vocaloidQuizSave");
  window.location.href = "quiz.html";
});