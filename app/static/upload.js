const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");

dropzone.addEventListener("click", () => fileInput.click());

dropzone.addEventListener("dragover", e => {
  e.preventDefault();
  dropzone.classList.add("drag-over");
});

dropzone.addEventListener("dragleave", () => {
  dropzone.classList.remove("drag-over");
});

dropzone.addEventListener("drop", e => {
  e.preventDefault();
  dropzone.classList.remove("drag-over");
  uploadFile(e.dataTransfer.files[0]);
});

fileInput.addEventListener("change", e => {
  uploadFile(e.target.files[0]);
});

function uploadFile(file) {
  const form = new FormData();
  form.append("file", file);

  fetch("/upload", {
    method: "POST",
    body: form
  })
  .then(res => res.json())
  .then(data => {
    window.location.href = `/chat/${data.doc_id}`;
  });
}
