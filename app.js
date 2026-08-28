const form = document.querySelector('#order-form');
const steps = [...document.querySelectorAll('.form-step')];
const nextButton = document.querySelector('#next-step');
const previousButton = document.querySelector('#prev-step');
const submitButton = document.querySelector('#submit-order');
const progressLabel = document.querySelector('#progress-label');
const progressBar = document.querySelector('#progress-bar');
const error = document.querySelector('#form-error');
const success = document.querySelector('#success-message');
const successTitle = document.querySelector('#success-title');
const successDetails = document.querySelector('#success-details');
const summary = document.querySelector('#order-summary');
const citySelect = form.querySelector('[name="city"]');
const otherCityField = document.querySelector('#other-city-field');
const otherCityInput = form.querySelector('[name="other_city"]');
const artworkInput = form.querySelector('[name="artwork"]');
const storageKey = 'remuvki-calculator-draft-v1';
let currentStep = 0;

const labels = {
  sublimation: 'Сублимация', dtf: 'DTF', film: 'Плёнка', embroidery: 'Вышивка', help: 'Помогите подобрать',
  ready: 'Макет готов', review: 'Нужна доработка', new: 'Нужен дизайн',
};

function selectedValue(name) {
  const field = form.elements[name];
  if (!field) return '';
  if (field instanceof RadioNodeList) return field.value;
  return field.value;
}

function updateSummary() {
  const city = citySelect.value === 'Другой город' ? otherCityInput.value || 'Другой город' : citySelect.value;
  const rows = [
    ['Технология', labels[selectedValue('technology')] || 'Не выбрана'],
    ['Тираж', `${selectedValue('quantity') || 100} шт.`],
    ['Размер', selectedValue('size') || 'Не выбран'],
    ['Стороны', selectedValue('sides') === '2' ? 'Две' : 'Одна'],
    ['Фурнитура', selectedValue('hardware') || 'Не выбрана'],
    ['Город', city || 'Не выбран'],
    ['Макет', labels[selectedValue('design_service')] || 'Не указано'],
    ['Файл', artworkInput.files[0]?.name || 'Не приложен'],
  ];
  summary.replaceChildren(...rows.map(([term, value]) => {
    const row = document.createElement('div');
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = term;
    dd.textContent = value;
    row.append(dt, dd);
    return row;
  }));
}

function saveDraft() {
  const draft = {};
  new FormData(form).forEach((value, key) => {
    if (!(value instanceof File) && key !== 'consent') draft[key] = value;
  });
  localStorage.setItem(storageKey, JSON.stringify(draft));
}

function restoreDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(storageKey));
    if (!draft) return;
    Object.entries(draft).forEach(([name, value]) => {
      const field = form.elements[name];
      if (!field) return;
      if (field instanceof RadioNodeList) {
        const radio = [...field].find((item) => item.value === value);
        if (radio) radio.checked = true;
      } else field.value = value;
    });
  } catch {
    localStorage.removeItem(storageKey);
  }
}

function updateCityField() {
  const needsCity = citySelect.value === 'Другой город';
  otherCityField.classList.toggle('is-hidden', !needsCity);
  otherCityInput.required = needsCity;
}

function showStep(index) {
  currentStep = index;
  steps.forEach((step, stepIndex) => step.classList.toggle('is-active', stepIndex === index));
  progressLabel.textContent = `Шаг ${index + 1} из ${steps.length}`;
  progressBar.style.width = `${((index + 1) / steps.length) * 100}%`;
  previousButton.disabled = index === 0;
  nextButton.classList.toggle('is-hidden', index === steps.length - 1);
  submitButton.classList.toggle('is-hidden', index !== steps.length - 1);
  error.textContent = '';
  if (index === steps.length - 1) updateSummary();
}

function validateStep() {
  const fields = [...steps[currentStep].querySelectorAll('input, select, textarea')];
  const invalid = fields.find((field) => !field.checkValidity());
  if (!invalid) return true;
  if (invalid.name === 'quantity') error.textContent = 'Минимальный тираж — 100 штук.';
  else if (invalid.type === 'radio') error.textContent = 'Выберите один из вариантов.';
  else if (invalid.name === 'consent') error.textContent = 'Нужно согласие на обработку персональных данных.';
  else error.textContent = 'Заполните обязательные поля этого шага.';
  invalid.focus();
  return false;
}

nextButton.addEventListener('click', () => {
  if (!validateStep()) return;
  showStep(Math.min(currentStep + 1, steps.length - 1));
});

previousButton.addEventListener('click', () => showStep(Math.max(currentStep - 1, 0)));

function applicationPayload() {
  const data = new FormData(form);
  const payload = Object.fromEntries([...data.entries()].filter(([, value]) => !(value instanceof File)));
  payload.quantity = Number(payload.quantity);
  payload.consent = form.elements.consent.checked;
  payload.original_filename = artworkInput.files[0]?.name || '';
  return payload;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!validateStep()) return;
  const isStaticPreview = window.location.hostname.endsWith('github.io');
  if (isStaticPreview) {
    successTitle.textContent = 'Демонстрационная заявка собрана';
    successDetails.textContent = 'Данные никуда не отправлялись. На рабочем сервере после сохранения здесь появится номер заявки.';
    form.classList.add('is-hidden');
    success.classList.remove('is-hidden');
    success.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  submitButton.disabled = true;
  submitButton.textContent = 'Отправляем…';
  error.textContent = '';
  try {
    const response = await fetch('/api/applications', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(applicationPayload()),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'request_failed');
    const artwork = artworkInput.files[0];
    if (artwork && result.upload_token) {
      const uploadResponse = await fetch(`/api/applications/${result.id}/files`, {
        method: 'POST',
        headers: {
          'content-type': artwork.type || 'application/octet-stream',
          'x-original-name': encodeURIComponent(artwork.name),
          'x-upload-token': result.upload_token,
        },
        body: artwork,
      });
      if (!uploadResponse.ok) throw new Error('file_upload_failed');
    }
    localStorage.removeItem(storageKey);
    successTitle.textContent = 'Заявка принята';
    successDetails.textContent = artwork
      ? `Номер ${result.public_number}. Файл загружен и ожидает проверки.`
      : `Номер ${result.public_number}. Менеджер проверит параметры и свяжется с вами.`;
    form.classList.add('is-hidden');
    success.classList.remove('is-hidden');
    success.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch {
    error.textContent = 'Не удалось сохранить заявку. Данные остались в форме — попробуйте ещё раз позже.';
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'Отправить на расчёт';
  }
});

document.querySelector('#restart-form').addEventListener('click', () => {
  form.reset();
  localStorage.removeItem(storageKey);
  updateCityField();
  form.classList.remove('is-hidden');
  success.classList.add('is-hidden');
  showStep(0);
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

document.querySelectorAll('[data-technology]').forEach((button) => {
  button.addEventListener('click', () => {
    const input = form.querySelector(`input[name="technology"][value="${button.dataset.technology}"]`);
    input.checked = true;
    showStep(0);
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

const dateInput = form.querySelector('input[name="deadline"]');
const minimumDate = new Date();
minimumDate.setDate(minimumDate.getDate() + 3);
dateInput.min = minimumDate.toISOString().slice(0, 10);

form.addEventListener('change', () => {
  saveDraft();
  updateSummary();
});
form.addEventListener('input', (event) => {
  if (event.target.type !== 'file') saveDraft();
});
citySelect.addEventListener('change', updateCityField);
artworkInput.addEventListener('change', () => {
  const file = artworkInput.files[0];
  if (file && file.size > 50 * 1024 * 1024) {
    artworkInput.value = '';
    error.textContent = 'Файл слишком большой. Загрузите файл до 50 МБ.';
  }
  updateSummary();
});

restoreDraft();
updateCityField();
updateSummary();
showStep(0);
