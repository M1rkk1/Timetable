const state = {
  classes: [],
  teachers: [],
  subjects: [],
  assignments: [],
  generated: null,
};

const els = {
  tabs: document.querySelectorAll(".tab"),
  tabPanels: document.querySelectorAll(".tab-panel"),
  daysInput: document.querySelector("#daysInput"),
  periodsInput: document.querySelector("#periodsInput"),
  breakInput: document.querySelector("#breakInput"),
  maxDailyInput: document.querySelector("#maxDailyInput"),
  classForm: document.querySelector("#classForm"),
  teacherForm: document.querySelector("#teacherForm"),
  subjectForm: document.querySelector("#subjectForm"),
  assignmentForm: document.querySelector("#assignmentForm"),
  classNameInput: document.querySelector("#classNameInput"),
  teacherNameInput: document.querySelector("#teacherNameInput"),
  teacherUnavailableInput: document.querySelector("#teacherUnavailableInput"),
  subjectNameInput: document.querySelector("#subjectNameInput"),
  assignmentClassSelect: document.querySelector("#assignmentClassSelect"),
  assignmentSubjectSelect: document.querySelector("#assignmentSubjectSelect"),
  assignmentTeacherSelect: document.querySelector("#assignmentTeacherSelect"),
  assignmentPeriodsInput: document.querySelector("#assignmentPeriodsInput"),
  classesList: document.querySelector("#classesList"),
  teachersList: document.querySelector("#teachersList"),
  subjectsList: document.querySelector("#subjectsList"),
  assignmentsList: document.querySelector("#assignmentsList"),
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

function addUnique(collection, item, nameKey = "name") {
  const name = cleanName(item[nameKey]);
  if (!name) return false;
  const exists = collection.some((entry) => entry[nameKey].toLowerCase() === name.toLowerCase());
  if (exists) return false;
  collection.push({ ...item, [nameKey]: name });
  return true;
}

function parseDays() {
  return els.daysInput.value
    .split(",")
    .map(cleanName)
    .filter(Boolean);
}

function parseUnavailable(value, days, periodsPerDay) {
  if (!value.trim()) return new Set();
  const unavailable = new Set();
  const dayLookup = new Map(days.map((day) => [day.toLowerCase(), day]));
  value
    .split(",")
    .map(cleanName)
    .forEach((token) => {
      const match = token.match(/^(.+?)\s+p(?:eriod)?\s*(\d+)$/i);
      if (!match) return;
      const day = dayLookup.get(match[1].trim().toLowerCase());
      const period = Number(match[2]);
      if (day && period >= 1 && period <= periodsPerDay) unavailable.add(slotKey(day, period));
    });
  return unavailable;
}

function slotKey(day, period) {
  return `${day}::${period}`;
}

function showNotice(message, type = "") {
  els.notice.className = `notice ${type}`.trim();
  els.notice.textContent = message;
}

function setActiveTab(id) {
  els.tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === id));
  els.tabPanels.forEach((panel) => panel.classList.toggle("active", panel.id === id));
}

function renderList(container, items, describe, onRemove) {
  container.innerHTML = "";
  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "Nothing added yet.";
    container.append(empty);
    return;
  }

  items.forEach((item) => {
    const node = els.itemTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector("strong").textContent = describe(item).title;
    node.querySelector("span").textContent = describe(item).subtitle || "";
    node.querySelector("button").addEventListener("click", () => onRemove(item.id));
    container.append(node);
  });
}

function fillSelect(select, items, placeholder) {
  select.innerHTML = "";
  const option = document.createElement("option");
  option.value = "";
  option.textContent = placeholder;
  select.append(option);
  items.forEach((item) => {
    const itemOption = document.createElement("option");
    itemOption.value = item.id;
    itemOption.textContent = item.name;
    select.append(itemOption);
  });
}

function removeById(collection, id) {
  const index = collection.findIndex((item) => item.id === id);
  if (index >= 0) collection.splice(index, 1);
}

function renderSetup() {
  renderList(
    els.classesList,
    state.classes,
    (item) => ({ title: item.name }),
    (id) => {
      removeById(state.classes, id);
      state.assignments = state.assignments.filter((item) => item.classId !== id);
      renderSetup();
    },
  );

  renderList(
    els.teachersList,
    state.teachers,
    (item) => ({
      title: item.name,
      subtitle: item.unavailableText ? `Unavailable: ${item.unavailableText}` : "Available all week",
    }),
    (id) => {
      removeById(state.teachers, id);
      state.assignments = state.assignments.filter((item) => item.teacherId !== id);
      renderSetup();
    },
  );

  renderList(
    els.subjectsList,
    state.subjects,
    (item) => ({ title: item.name }),
    (id) => {
      removeById(state.subjects, id);
      state.assignments = state.assignments.filter((item) => item.subjectId !== id);
      renderSetup();
    },
  );

  renderList(
    els.assignmentsList,
    state.assignments,
    (item) => {
      const classItem = state.classes.find((entry) => entry.id === item.classId);
      const subject = state.subjects.find((entry) => entry.id === item.subjectId);
      const teacher = state.teachers.find((entry) => entry.id === item.teacherId);
      return {
        title: `${classItem?.name || "Unknown class"} - ${subject?.name || "Unknown subject"}`,
        subtitle: `${teacher?.name || "Unknown teacher"} - ${item.periodsPerWeek} lessons/week`,
      };
    },
    (id) => {
      removeById(state.assignments, id);
      renderSetup();
    },
  );

  fillSelect(els.assignmentClassSelect, state.classes, "Choose class");
  fillSelect(els.assignmentSubjectSelect, state.subjects, "Choose subject");
  fillSelect(els.assignmentTeacherSelect, state.teachers, "Choose teacher");
}

function validateSetup(days, periodsPerDay, breakAfter, maxDaily) {
  const errors = [];
  if (days.length < 1) errors.push("Add at least one teaching day.");
  if (periodsPerDay < 1 || periodsPerDay > 12) errors.push("Periods per day must be between 1 and 12.");
  if (breakAfter < 0 || breakAfter > periodsPerDay) errors.push("Break after period must fit inside the day.");
  if (maxDaily < 1 || maxDaily > periodsPerDay) errors.push("Max teacher periods per day must fit inside the day.");
  if (!state.classes.length) errors.push("Add at least one class.");
  if (!state.teachers.length) errors.push("Add at least one teacher.");
  if (!state.subjects.length) errors.push("Add at least one subject.");
  if (!state.assignments.length) errors.push("Add at least one teaching assignment.");

  const capacity = days.length * periodsPerDay;
  state.classes.forEach((classItem) => {
    const required = state.assignments
      .filter((assignment) => assignment.classId === classItem.id)
      .reduce((total, assignment) => total + assignment.periodsPerWeek, 0);
    if (required > capacity) {
      errors.push(`${classItem.name} needs ${required} lessons but only has ${capacity} slots.`);
    }
  });

  return errors;
}

function buildTasks() {
  const tasks = [];
  state.assignments.forEach((assignment) => {
    for (let index = 0; index < assignment.periodsPerWeek; index += 1) {
      tasks.push({
        id: `${assignment.id}-${index}`,
        assignmentId: assignment.id,
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
  const errors = validateSetup(days, periodsPerDay, breakAfter, maxDaily);

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
  const tasks = buildTasks().sort((a, b) => {
    const teacherLoadA = state.assignments
      .filter((assignment) => assignment.teacherId === a.teacherId)
      .reduce((total, assignment) => total + assignment.periodsPerWeek, 0);
    const teacherLoadB = state.assignments
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
        if (canPlace(task, day, period)) {
          slots.push({ day, period });
        }
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

  const solved = solve();
  if (!solved) {
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
    ["Lessons", usedSlots],
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
        rows.push([
          classItem.name,
          day,
          `P${period}`,
          detail?.subject.name || "",
          detail?.teacher.name || "",
        ]);
      }
    });
  });
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "school-timetable.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function clearAll() {
  state.classes = [];
  state.teachers = [];
  state.subjects = [];
  state.assignments = [];
  state.generated = null;
  els.timetableArea.innerHTML = "";
  els.stats.innerHTML = "";
  els.resultTitle.textContent = "Ready when you are";
  els.exportButton.disabled = true;
  els.printButton.disabled = true;
  showNotice("Add your school details, then generate a timetable. A realistic sample is included for quick testing.");
  renderSetup();
}

function loadSample() {
  state.classes = ["Form 1 East", "Form 1 West", "Form 2 East"].map((name) => ({ id: uid("class"), name }));
  state.teachers = [
    { name: "Ms. Achieng", unavailableText: "Friday P8" },
    { name: "Mr. Kamau", unavailableText: "Monday P1" },
    { name: "Mrs. Otieno", unavailableText: "" },
    { name: "Mr. Njoroge", unavailableText: "Wednesday P6" },
    { name: "Ms. Wanjiku", unavailableText: "" },
  ].map((teacher) => ({ id: uid("teacher"), ...teacher }));
  state.subjects = ["Mathematics", "English", "Biology", "History", "Kiswahili"].map((name) => ({
    id: uid("subject"),
    name,
  }));

  const find = (collection, name) => collection.find((item) => item.name === name).id;
  const subjectTeacher = {
    Mathematics: "Ms. Achieng",
    English: "Mr. Kamau",
    Biology: "Mrs. Otieno",
    History: "Mr. Njoroge",
    Kiswahili: "Ms. Wanjiku",
  };
  state.assignments = [];
  state.classes.forEach((classItem) => {
    Object.entries(subjectTeacher).forEach(([subject, teacher]) => {
      state.assignments.push({
        id: uid("assignment"),
        classId: classItem.id,
        subjectId: find(state.subjects, subject),
        teacherId: find(state.teachers, teacher),
        periodsPerWeek: subject === "Mathematics" || subject === "English" ? 5 : 3,
      });
    });
  });
  renderSetup();
  showNotice("Sample data loaded. Press Generate to create a timetable.", "success");
}

els.tabs.forEach((tab) => tab.addEventListener("click", () => setActiveTab(tab.dataset.tab)));

els.classForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (addUnique(state.classes, { id: uid("class"), name: els.classNameInput.value })) {
    els.classNameInput.value = "";
    renderSetup();
  }
});

els.teacherForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (
    addUnique(state.teachers, {
      id: uid("teacher"),
      name: els.teacherNameInput.value,
      unavailableText: cleanName(els.teacherUnavailableInput.value),
    })
  ) {
    els.teacherNameInput.value = "";
    els.teacherUnavailableInput.value = "";
    renderSetup();
  }
});

els.subjectForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (addUnique(state.subjects, { id: uid("subject"), name: els.subjectNameInput.value })) {
    els.subjectNameInput.value = "";
    renderSetup();
  }
});

els.assignmentForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const assignment = {
    id: uid("assignment"),
    classId: els.assignmentClassSelect.value,
    subjectId: els.assignmentSubjectSelect.value,
    teacherId: els.assignmentTeacherSelect.value,
    periodsPerWeek: Number(els.assignmentPeriodsInput.value),
  };
  const duplicate = state.assignments.some(
    (item) => item.classId === assignment.classId && item.subjectId === assignment.subjectId,
  );
  if (!duplicate && assignment.classId && assignment.subjectId && assignment.teacherId) {
    state.assignments.push(assignment);
    renderSetup();
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

renderSetup();
