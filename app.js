const state = {
  classes: [],
  teachers: [],
  subjects: [],
  loads: [],
  generated: null,
};

const els = {
  tabs: document.querySelectorAll(".tab"),
  tabPanels: document.querySelectorAll(".tab-panel"),
  daysInput: document.querySelector("#daysInput"),
  periodsInput: document.querySelector("#periodsInput"),
  breakInput: document.querySelector("#breakInput"),
  maxDailyInput: document.querySelector("#maxDailyInput"),
  teacherLoadForm: document.querySelector("#teacherLoadForm"),
  teacherNameInput: document.querySelector("#teacherNameInput"),
  teacherClassesInput: document.querySelector("#teacherClassesInput"),
  teacherSubjectInput: document.querySelector("#teacherSubjectInput"),
  teacherUnavailableInput: document.querySelector("#teacherUnavailableInput"),
  teacherLoadsList: document.querySelector("#teacherLoadsList"),
  itemTemplate: document.querySelector("#itemTemplate"),
  loadSampleButton: document.querySelector("#loadSampleButton"),
  clearButton: document.querySelector("#clearButton"),
  generateButton: document.querySelector("#generateButton"),
  exportButton: document.querySelector("#exportButton"),
  printButton: document.querySelector("#printButton"),
  notice: document.querySelector("#notice"),
  stats: document.querySelector("#stats"),
  timetableArea: document.querySelector("#timetableArea"),
  resultTitle: document.querySelector("#resultTitle"),
};

function checkRequiredElements() {
  const missing = [];
  Object.keys(els).forEach((name) => {
    const element = els[name];
    if (element && typeof element.length === "number" && typeof element.forEach === "function") {
      if (element.length === 0) missing.push(name);
      return;
    }
    if (!element) missing.push(name);
  });

  if (missing.length) {
    throw new Error(`Missing page elements: ${missing.join(", ")}`);
  }
}

function uid(prefix) {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return `${prefix}-${window.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function cleanName(value) {
  return value.trim().replace(/\s+/g, " ");
}

function parseList(value) {
  const names = value
    .split(",")
    .map(cleanName)
    .filter(Boolean);
  return [...new Map(names.map((name) => [name.toLowerCase(), name])).values()];
}

function findOrCreate(collection, name, prefix, extra = {}) {
  const clean = cleanName(name);
  const existing = collection.find((item) => item.name.toLowerCase() === clean.toLowerCase());
  if (existing) return existing;
  const created = { id: uid(prefix), name: clean, ...extra };
  collection.push(created);
  return created;
}

function parseDays() {
  return parseList(els.daysInput.value);
}

function slotKey(day, period) {
  return `${day}::${period}`;
}

function parseUnavailable(value, days, periodsPerDay) {
  if (!value.trim()) return new Set();
  const unavailable = new Set();
  const dayLookup = new Map(days.map((day) => [day.toLowerCase(), day]));
  parseList(value).forEach((token) => {
    const match = token.match(/^(.+?)\s+p(?:eriod)?\s*(\d+)$/i);
    if (!match) return;
    const day = dayLookup.get(match[1].trim().toLowerCase());
    const period = Number(match[2]);
    if (day && period >= 1 && period <= periodsPerDay) unavailable.add(slotKey(day, period));
  });
  return unavailable;
}

function showNotice(message, type = "") {
  els.notice.className = `notice ${type}`.trim();
  els.notice.textContent = message;
}

function forEachNode(nodes, callback) {
  Array.prototype.forEach.call(nodes, callback);
}

function setActiveTab(id) {
  forEachNode(els.tabs, (tab) => tab.classList.toggle("active", tab.dataset.tab === id));
  forEachNode(els.tabPanels, (panel) => panel.classList.toggle("active", panel.id === id));
}

function removeById(collection, id) {
  const index = collection.findIndex((item) => item.id === id);
  if (index >= 0) collection.splice(index, 1);
}

function getClassNames(load) {
  return load.classIds
    .map((id) => {
      const classItem = state.classes.find((item) => item.id === id);
      return classItem ? classItem.name : "";
    })
    .filter(Boolean);
}

function rebuildCatalogs() {
  const usedClassIds = new Set();
  const usedTeacherIds = new Set();
  const usedSubjectIds = new Set();
  state.loads.forEach((load) => {
    load.classIds.forEach((classId) => usedClassIds.add(classId));
    usedTeacherIds.add(load.teacherId);
    usedSubjectIds.add(load.subjectId);
  });
  state.classes = state.classes.filter((item) => usedClassIds.has(item.id));
  state.teachers = state.teachers.filter((item) => usedTeacherIds.has(item.id));
  state.subjects = state.subjects.filter((item) => usedSubjectIds.has(item.id));
}

function renderLoads() {
  els.teacherLoadsList.innerHTML = "";
  if (!state.loads.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No teacher loads added yet.";
    els.teacherLoadsList.append(empty);
    return;
  }

  state.loads.forEach((load) => {
    const teacher = state.teachers.find((item) => item.id === load.teacherId);
    const subject = state.subjects.find((item) => item.id === load.subjectId);
    const node = els.itemTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector("strong").textContent = `${teacher ? teacher.name : "Teacher"} - ${subject ? subject.name : "Subject"}`;
    node.querySelector("span").textContent =
      `${getClassNames(load).join(", ")}` +
      (teacher && teacher.unavailableText ? ` - Unavailable: ${teacher.unavailableText}` : "");
    node.querySelector("button").addEventListener("click", () => {
      removeById(state.loads, load.id);
      rebuildCatalogs();
      renderLoads();
    });
    els.teacherLoadsList.append(node);
  });
}

function addTeacherLoad({ teacherName, classNames, subjectName, unavailableText }) {
  const teacher = findOrCreate(state.teachers, teacherName, "teacher", { unavailableText: "" });
  const subject = findOrCreate(state.subjects, subjectName, "subject");
  const classes = classNames.map((name) => findOrCreate(state.classes, name, "class"));
  if (unavailableText) teacher.unavailableText = cleanName(unavailableText);

  const occupiedClasses = [];
  state.loads.forEach((load) => {
    if (load.subjectId === subject.id) {
      load.classIds.forEach((classId) => occupiedClasses.push(classId));
    }
  });
  const repeatedClass = classes.find((classItem) => occupiedClasses.includes(classItem.id));
  if (repeatedClass) {
    showNotice(`${subject.name} is already assigned for ${repeatedClass.name}. Remove that load first.`, "error");
    return false;
  }

  state.loads.push({
    id: uid("load"),
    teacherId: teacher.id,
    subjectId: subject.id,
    classIds: classes.map((classItem) => classItem.id),
  });
  return true;
}

function buildOptions() {
  const options = [];
  state.loads.forEach((load) => {
    load.classIds.forEach((classId) => {
      options.push({
        id: `${load.id}-${classId}`,
        classId,
        subjectId: load.subjectId,
        teacherId: load.teacherId,
      });
    });
  });
  return options;
}

function validateSetup(days, periodsPerDay, breakAfter, maxDaily, options) {
  const errors = [];
  if (days.length < 1) errors.push("Add at least one teaching day.");
  if (periodsPerDay < 1 || periodsPerDay > 12) errors.push("Periods per day must be between 1 and 12.");
  if (breakAfter < 0 || breakAfter > periodsPerDay) errors.push("Break after period must fit inside the day.");
  if (maxDaily < 1 || maxDaily > periodsPerDay) errors.push("Max teacher periods per day must fit inside the day.");
  if (!state.loads.length) errors.push("Add at least one teacher load.");
  state.classes.forEach((classItem) => {
    const hasSubjects = options.some((option) => option.classId === classItem.id);
    if (!hasSubjects) {
      errors.push(`${classItem.name} has no subjects assigned.`);
    }
  });

  return errors;
}

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function createEmptySchedule(days, periodsPerDay) {
  const schedule = {};
  state.classes.forEach((classItem) => {
    schedule[classItem.id] = {};
    days.forEach((day) => {
      schedule[classItem.id][day] = {};
      for (let period = 1; period <= periodsPerDay; period += 1) {
        schedule[classItem.id][day][period] = null;
      }
    });
  });
  return schedule;
}

function generateTimetable() {
  const days = parseDays();
  const periodsPerDay = Number(els.periodsInput.value);
  const breakAfter = Number(els.breakInput.value);
  const maxDaily = Number(els.maxDailyInput.value);
  const options = buildOptions();
  const errors = validateSetup(days, periodsPerDay, breakAfter, maxDaily, options);

  if (errors.length) {
    showNotice(errors.join(" "), "error");
    return null;
  }

  const teacherUnavailable = new Map(
    state.teachers.map((teacher) => [
      teacher.id,
      parseUnavailable(teacher.unavailableText || "", days, periodsPerDay),
    ]),
  );
  const schedule = createEmptySchedule(days, periodsPerDay);
  const teacherBooked = new Map();
  const teacherDailyLoad = new Map();
  const classSubjectDaily = new Map();
  const placements = [];

  function canPlace(option, day, period) {
    const key = slotKey(day, period);
    const previous = period > 1 ? schedule[option.classId][day][period - 1] : null;
    if (schedule[option.classId][day][period]) return false;
    if (teacherBooked.get(`${option.teacherId}::${key}`)) return false;
    const unavailable = teacherUnavailable.get(option.teacherId);
    if (unavailable && unavailable.has(key)) return false;
    if ((teacherDailyLoad.get(`${option.teacherId}::${day}`) || 0) >= maxDaily) return false;
    if ((classSubjectDaily.get(`${option.classId}::${option.subjectId}::${day}`) || 0) >= 2) return false;
    if (previous && previous.subjectId === option.subjectId) return false;
    return true;
  }

  function place(option, day, period) {
    const key = slotKey(day, period);
    const placement = { ...option, id: `${option.id}-${day}-${period}` };
    schedule[option.classId][day][period] = placement;
    teacherBooked.set(`${option.teacherId}::${key}`, true);
    teacherDailyLoad.set(`${option.teacherId}::${day}`, (teacherDailyLoad.get(`${option.teacherId}::${day}`) || 0) + 1);
    classSubjectDaily.set(
      `${option.classId}::${option.subjectId}::${day}`,
      (classSubjectDaily.get(`${option.classId}::${option.subjectId}::${day}`) || 0) + 1,
    );
    placements.push(placement);
  }

  shuffle(state.classes).forEach((classItem) => {
    days.forEach((day) => {
      for (let period = 1; period <= periodsPerDay; period += 1) {
        const classOptions = options.filter((option) => option.classId === classItem.id);
        const candidates = shuffle(classOptions)
          .filter((option) => canPlace(option, day, period))
          .sort((a, b) => {
            const aSubjectLoad = classSubjectDaily.get(`${a.classId}::${a.subjectId}::${day}`) || 0;
            const bSubjectLoad = classSubjectDaily.get(`${b.classId}::${b.subjectId}::${day}`) || 0;
            const aTeacherLoad = teacherDailyLoad.get(`${a.teacherId}::${day}`) || 0;
            const bTeacherLoad = teacherDailyLoad.get(`${b.teacherId}::${day}`) || 0;
            return aSubjectLoad - bSubjectLoad || aTeacherLoad - bTeacherLoad;
          });
        if (candidates.length) place(candidates[0], day, period);
      }
    });
  });

  return { schedule, days, periodsPerDay, breakAfter, tasks: placements };
}

function lookupTask(task) {
  if (!task) return null;
  const subject = state.subjects.find((item) => item.id === task.subjectId);
  const teacher = state.teachers.find((item) => item.id === task.teacherId);
  return { subject, teacher };
}

function renderTimetable(result) {
  els.timetableArea.innerHTML = "";
  els.stats.innerHTML = "";

  if (!result) return;

  const totalSlots = state.classes.length * result.days.length * result.periodsPerDay;
  const usedSlots = result.tasks.length;
  const utilization = Math.round((usedSlots / totalSlots) * 100);
  const stats = [
    ["Classes", state.classes.length],
    ["Teachers", state.teachers.length],
    ["Subjects", state.subjects.length],
    ["Use", `${utilization}%`],
  ];

  stats.forEach(([label, value]) => {
    const stat = document.createElement("div");
    stat.className = "stat";
    stat.innerHTML = `<strong>${value}</strong><span>${label}</span>`;
    els.stats.append(stat);
  });

  state.classes.forEach((classItem) => {
    const wrapper = document.createElement("article");
    wrapper.className = "class-table";
    const title = document.createElement("div");
    title.className = "class-title";
    title.innerHTML = `<h3>${classItem.name}</h3><span>${result.days.length} days</span>`;
    wrapper.append(title);

    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    headRow.innerHTML = "<th>Period</th>";
    result.days.forEach((day) => {
      const th = document.createElement("th");
      th.textContent = day;
      headRow.append(th);
    });
    thead.append(headRow);
    table.append(thead);

    const tbody = document.createElement("tbody");
    for (let period = 1; period <= result.periodsPerDay; period += 1) {
      if (result.breakAfter > 0 && result.breakAfter === period - 1) {
        const breakRow = document.createElement("tr");
        breakRow.innerHTML = `<td class="break-cell" colspan="${result.days.length + 1}">Break</td>`;
        tbody.append(breakRow);
      }

      const row = document.createElement("tr");
      const label = document.createElement("th");
      label.textContent = `P${period}`;
      row.append(label);
      result.days.forEach((day) => {
        const cell = document.createElement("td");
        const task = result.schedule[classItem.id][day][period];
        const detail = lookupTask(task);
        if (detail) {
          cell.innerHTML = `<div class="lesson"><strong>${detail.subject.name}</strong><span>${detail.teacher.name}</span></div>`;
        }
        row.append(cell);
      });
      tbody.append(row);
    }
    table.append(tbody);
    wrapper.append(table);
    els.timetableArea.append(wrapper);
  });

  els.resultTitle.textContent = "Timetable generated";
  els.exportButton.disabled = false;
  els.printButton.disabled = false;
  showNotice("AI timetable generated. Blank spaces mean no safe subject fit that period.", "success");
}

function exportCsv() {
  if (!state.generated) return;
  const rows = [["Class", "Day", "Period", "Subject", "Teacher"]];
  state.classes.forEach((classItem) => {
    state.generated.days.forEach((day) => {
      for (let period = 1; period <= state.generated.periodsPerDay; period += 1) {
        const task = state.generated.schedule[classItem.id][day][period];
        const detail = lookupTask(task);
        rows.push([
          classItem.name,
          day,
          `P${period}`,
          detail && detail.subject ? detail.subject.name : "",
          detail && detail.teacher ? detail.teacher.name : "",
        ]);
      }
    });
  });
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "gamma-school-timetable.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function resetOutput() {
  state.generated = null;
  els.timetableArea.innerHTML = "";
  els.stats.innerHTML = "";
  els.resultTitle.textContent = "Ready when you are";
  els.exportButton.disabled = true;
  els.printButton.disabled = true;
}

function clearAll() {
  state.classes = [];
  state.teachers = [];
  state.subjects = [];
  state.loads = [];
  resetOutput();
  showNotice("Add teacher loads, then use AI Generate to place subjects into the timetable automatically.");
  renderLoads();
}

function loadSample() {
  clearAll();
  [
    ["Ms. Achieng", "Form 1 East, Form 1 West, Form 2 East", "Mathematics", "Friday P8"],
    ["Mr. Kamau", "Form 1 East, Form 1 West, Form 2 East", "English", "Monday P1"],
    ["Mrs. Otieno", "Form 1 East, Form 1 West, Form 2 East", "Biology", ""],
    ["Mr. Njoroge", "Form 1 East, Form 1 West, Form 2 East", "History", "Wednesday P6"],
    ["Ms. Wanjiku", "Form 1 East, Form 1 West, Form 2 East", "Kiswahili", ""],
  ].forEach(([teacherName, classes, subjectName, unavailableText]) => {
    addTeacherLoad({
      teacherName,
      classNames: parseList(classes),
      subjectName,
      unavailableText,
    });
  });
  renderLoads();
  showNotice("Sample teacher loads added. Press AI Generate to create a timetable.", "success");
}

checkRequiredElements();

forEachNode(els.tabs, (tab) => tab.addEventListener("click", () => setActiveTab(tab.dataset.tab)));

els.teacherLoadForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const classNames = parseList(els.teacherClassesInput.value);
  if (!classNames.length) {
    showNotice("Add at least one class or stream.", "error");
    return;
  }
  const added = addTeacherLoad({
    teacherName: els.teacherNameInput.value,
    classNames,
    subjectName: els.teacherSubjectInput.value,
    unavailableText: els.teacherUnavailableInput.value,
  });
  if (added) {
    els.teacherClassesInput.value = "";
    els.teacherSubjectInput.value = "";
    els.teacherUnavailableInput.value = "";
    renderLoads();
    showNotice("Teacher load added. Add another one or generate the timetable.", "success");
  }
});

els.generateButton.addEventListener("click", () => {
  state.generated = generateTimetable();
  renderTimetable(state.generated);
});
els.exportButton.addEventListener("click", exportCsv);
els.printButton.addEventListener("click", () => window.print());
els.clearButton.addEventListener("click", clearAll);
els.loadSampleButton.addEventListener("click", loadSample);

renderLoads();
