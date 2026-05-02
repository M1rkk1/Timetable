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
  teacherPeriodsInput: document.querySelector("#teacherPeriodsInput"),
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

function uid(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
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

function setActiveTab(id) {
  els.tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === id));
  els.tabPanels.forEach((panel) => panel.classList.toggle("active", panel.id === id));
}

function removeById(collection, id) {
  const index = collection.findIndex((item) => item.id === id);
  if (index >= 0) collection.splice(index, 1);
}

function getClassNames(load) {
  return load.classIds
    .map((id) => state.classes.find((classItem) => classItem.id === id)?.name)
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
    node.querySelector("strong").textContent = `${teacher?.name || "Teacher"} - ${subject?.name || "Subject"}`;
    node.querySelector("span").textContent =
      `${getClassNames(load).join(", ")} - ${load.periodsPerWeek} lessons/week` +
      (teacher?.unavailableText ? ` - Unavailable: ${teacher.unavailableText}` : "");
    node.querySelector("button").addEventListener("click", () => {
      removeById(state.loads, load.id);
      rebuildCatalogs();
      renderLoads();
    });
    els.teacherLoadsList.append(node);
  });
}

function addTeacherLoad({ teacherName, classNames, subjectName, periodsPerWeek, unavailableText }) {
  const teacher = findOrCreate(state.teachers, teacherName, "teacher", { unavailableText: "" });
  const subject = findOrCreate(state.subjects, subjectName, "subject");
  const classes = classNames.map((name) => findOrCreate(state.classes, name, "class"));
  if (unavailableText) teacher.unavailableText = cleanName(unavailableText);

  const occupiedClasses = state.loads.flatMap((load) =>
    load.subjectId === subject.id ? load.classIds : [],
  );
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
    periodsPerWeek,
  });
  return true;
}

function buildAssignments() {
  const assignments = [];
  state.loads.forEach((load) => {
    load.classIds.forEach((classId) => {
      assignments.push({
        id: `${load.id}-${classId}`,
        classId,
        subjectId: load.subjectId,
        teacherId: load.teacherId,
        periodsPerWeek: load.periodsPerWeek,
      });
    });
  });
  return assignments;
}

function validateSetup(days, periodsPerDay, breakAfter, maxDaily, assignments) {
  const errors = [];
  if (days.length < 1) errors.push("Add at least one teaching day.");
  if (periodsPerDay < 1 || periodsPerDay > 12) errors.push("Periods per day must be between 1 and 12.");
  if (breakAfter < 0 || breakAfter > periodsPerDay) errors.push("Break after period must fit inside the day.");
  if (maxDaily < 1 || maxDaily > periodsPerDay) errors.push("Max teacher periods per day must fit inside the day.");
  if (!state.loads.length) errors.push("Add at least one teacher load.");

  const capacity = days.length * periodsPerDay;
  state.classes.forEach((classItem) => {
    const required = assignments
      .filter((assignment) => assignment.classId === classItem.id)
      .reduce((total, assignment) => total + assignment.periodsPerWeek, 0);
    if (required > capacity) {
      errors.push(`${classItem.name} needs ${required} lessons but only has ${capacity} slots.`);
    }
  });

  return errors;
}

function buildTasks(assignments) {
  const tasks = [];
  assignments.forEach((assignment) => {
    for (let index = 0; index < assignment.periodsPerWeek; index += 1) {
      tasks.push({
        id: `${assignment.id}-${index}`,
        classId: assignment.classId,
        subjectId: assignment.subjectId,
        teacherId: assignment.teacherId,
      });
    }
  });
  return tasks;
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
  const assignments = buildAssignments();
  const errors = validateSetup(days, periodsPerDay, breakAfter, maxDaily, assignments);

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
  const tasks = buildTasks(assignments).sort((a, b) => {
    const teacherLoadA = assignments
      .filter((assignment) => assignment.teacherId === a.teacherId)
      .reduce((total, assignment) => total + assignment.periodsPerWeek, 0);
    const teacherLoadB = assignments
      .filter((assignment) => assignment.teacherId === b.teacherId)
      .reduce((total, assignment) => total + assignment.periodsPerWeek, 0);
    return teacherLoadB - teacherLoadA;
  });

  function canPlace(task, day, period) {
    const key = slotKey(day, period);
    if (schedule[task.classId][day][period]) return false;
    if (teacherBooked.get(`${task.teacherId}::${key}`)) return false;
    if (teacherUnavailable.get(task.teacherId)?.has(key)) return false;
    if ((teacherDailyLoad.get(`${task.teacherId}::${day}`) || 0) >= maxDaily) return false;
    if ((classSubjectDaily.get(`${task.classId}::${task.subjectId}::${day}`) || 0) >= 2) return false;
    return true;
  }

  function place(task, day, period) {
    const key = slotKey(day, period);
    schedule[task.classId][day][period] = task;
    teacherBooked.set(`${task.teacherId}::${key}`, true);
    teacherDailyLoad.set(`${task.teacherId}::${day}`, (teacherDailyLoad.get(`${task.teacherId}::${day}`) || 0) + 1);
    classSubjectDaily.set(
      `${task.classId}::${task.subjectId}::${day}`,
      (classSubjectDaily.get(`${task.classId}::${task.subjectId}::${day}`) || 0) + 1,
    );
  }

  function unplace(task, day, period) {
    const key = slotKey(day, period);
    schedule[task.classId][day][period] = null;
    teacherBooked.delete(`${task.teacherId}::${key}`);
    teacherDailyLoad.set(`${task.teacherId}::${day}`, teacherDailyLoad.get(`${task.teacherId}::${day}`) - 1);
    classSubjectDaily.set(
      `${task.classId}::${task.subjectId}::${day}`,
      classSubjectDaily.get(`${task.classId}::${task.subjectId}::${day}`) - 1,
    );
  }

  function candidateSlots(task) {
    const slots = [];
    days.forEach((day) => {
      for (let period = 1; period <= periodsPerDay; period += 1) {
        if (canPlace(task, day, period)) slots.push({ day, period });
      }
    });
    return slots.sort((a, b) => {
      const loadA = teacherDailyLoad.get(`${task.teacherId}::${a.day}`) || 0;
      const loadB = teacherDailyLoad.get(`${task.teacherId}::${b.day}`) || 0;
      return loadA - loadB || a.period - b.period;
    });
  }

  function solve(index = 0) {
    if (index === tasks.length) return true;
    const remaining = tasks.slice(index);
    remaining.sort((a, b) => candidateSlots(a).length - candidateSlots(b).length);
    const task = remaining[0];
    const originalIndex = tasks.findIndex((entry, taskIndex) => taskIndex >= index && entry.id === task.id);
    [tasks[index], tasks[originalIndex]] = [tasks[originalIndex], tasks[index]];

    for (const slot of candidateSlots(task)) {
      place(task, slot.day, slot.period);
      if (solve(index + 1)) return true;
      unplace(task, slot.day, slot.period);
    }

    [tasks[index], tasks[originalIndex]] = [tasks[originalIndex], tasks[index]];
    return false;
  }

  if (!solve()) {
    showNotice(
      "A conflict-free timetable could not be found. Try increasing periods, lowering lessons, or relaxing teacher availability.",
      "error",
    );
    return null;
  }

  return { schedule, days, periodsPerDay, breakAfter, tasks };
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
  showNotice("Conflict-free timetable generated. Review it by class, then export or print.", "success");
}

function exportCsv() {
  if (!state.generated) return;
  const rows = [["Class", "Day", "Period", "Subject", "Teacher"]];
  state.classes.forEach((classItem) => {
    state.generated.days.forEach((day) => {
      for (let period = 1; period <= state.generated.periodsPerDay; period += 1) {
        const task = state.generated.schedule[classItem.id][day][period];
        const detail = lookupTask(task);
        rows.push([classItem.name, day, `P${period}`, detail?.subject.name || "", detail?.teacher.name || ""]);
      }
    });
  });
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
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
  showNotice("Add teacher loads, then generate a timetable. Use the sample button to test it quickly.");
  renderLoads();
}

function loadSample() {
  clearAll();
  [
    ["Ms. Achieng", "Form 1 East, Form 1 West, Form 2 East", "Mathematics", 5, "Friday P8"],
    ["Mr. Kamau", "Form 1 East, Form 1 West, Form 2 East", "English", 5, "Monday P1"],
    ["Mrs. Otieno", "Form 1 East, Form 1 West, Form 2 East", "Biology", 3, ""],
    ["Mr. Njoroge", "Form 1 East, Form 1 West, Form 2 East", "History", 3, "Wednesday P6"],
    ["Ms. Wanjiku", "Form 1 East, Form 1 West, Form 2 East", "Kiswahili", 3, ""],
  ].forEach(([teacherName, classes, subjectName, periodsPerWeek, unavailableText]) => {
    addTeacherLoad({
      teacherName,
      classNames: parseList(classes),
      subjectName,
      periodsPerWeek,
      unavailableText,
    });
  });
  renderLoads();
  showNotice("Sample teacher loads added. Press Generate to create a timetable.", "success");
}

els.tabs.forEach((tab) => tab.addEventListener("click", () => setActiveTab(tab.dataset.tab)));

els.teacherLoadForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const classNames = parseList(els.teacherClassesInput.value);
  const periodsPerWeek = Number(els.teacherPeriodsInput.value);
  if (!classNames.length || periodsPerWeek < 1) {
    showNotice("Add at least one class and one lesson per week.", "error");
    return;
  }
  const added = addTeacherLoad({
    teacherName: els.teacherNameInput.value,
    classNames,
    subjectName: els.teacherSubjectInput.value,
    periodsPerWeek,
    unavailableText: els.teacherUnavailableInput.value,
  });
  if (added) {
    els.teacherClassesInput.value = "";
    els.teacherSubjectInput.value = "";
    els.teacherPeriodsInput.value = "4";
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
