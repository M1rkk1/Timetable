const state = {
  classes: [],
  teachers: [],
  subjects: [],
  loads: [],
  breaks: [],
  generated: null,
};

const els = {
  tabs: document.querySelectorAll(".tab"),
  tabPanels: document.querySelectorAll(".tab-panel"),
  columnsInput: document.querySelector("#columnsInput"),
  rowsInput: document.querySelector("#rowsInput"),
  daysInput: document.querySelector("#daysInput"),
  startTimeInput: document.querySelector("#startTimeInput"),
  lessonDurationInput: document.querySelector("#lessonDurationInput"),
  maxDailyInput: document.querySelector("#maxDailyInput"),
  breakForm: document.querySelector("#breakForm"),
  breakNameInput: document.querySelector("#breakNameInput"),
  breakTimeInput: document.querySelector("#breakTimeInput"),
  breakDurationInput: document.querySelector("#breakDurationInput"),
  breaksList: document.querySelector("#breaksList"),
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

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function parseList(value) {
  const names = value
    .split(",")
    .map(cleanName)
    .filter(Boolean);
  return [...new Map(names.map((name) => [name.toLowerCase(), name])).values()];
}

function normalizeTime(value) {
  return cleanName(value).toLowerCase().replace(/\s/g, "");
}

function parseTimeToMinutes(value) {
  const clean = normalizeTime(value);
  const match = clean.match(/^(\d{1,2}):?(\d{2})?(am|pm)?$/);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = match[2] === undefined ? 0 : Number(match[2]);
  const meridiem = match[3];
  if (meridiem === "pm" && hours < 12) hours += 12;
  if (meridiem === "am" && hours === 12) hours = 0;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function formatMinutes(totalMinutes) {
  const minutesInDay = 24 * 60;
  const wrapped = ((totalMinutes % minutesInDay) + minutesInDay) % minutesInDay;
  const hours = Math.floor(wrapped / 60);
  const minutes = wrapped % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function formatDuration(minutes) {
  return `${minutes} min`;
}

function getSortedBreaks() {
  return state.breaks
    .map((breakItem) => ({
      ...breakItem,
      startMinutes: parseTimeToMinutes(breakItem.time),
      durationMinutes: Number(breakItem.duration),
    }))
    .filter((breakItem) => breakItem.startMinutes !== null && breakItem.durationMinutes > 0)
    .sort((a, b) => a.startMinutes - b.startMinutes);
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
  const columnCount = Number(els.columnsInput.value);
  const names = parseList(els.daysInput.value);
  while (names.length < columnCount) {
    names.push(`Column ${names.length + 1}`);
  }
  return names.slice(0, columnCount);
}

function parseTimeSlots() {
  const rowCount = Number(els.rowsInput.value);
  const lessonDuration = Number(els.lessonDurationInput.value);
  const startMinutes = parseTimeToMinutes(els.startTimeInput.value);
  const labels = [];
  let current = startMinutes === null ? 8 * 60 : startMinutes;
  const sortedBreaks = getSortedBreaks();
  let breakIndex = 0;

  while (labels.length < rowCount) {
    while (breakIndex < sortedBreaks.length && sortedBreaks[breakIndex].startMinutes <= current) {
      current = Math.max(
        current,
        sortedBreaks[breakIndex].startMinutes + sortedBreaks[breakIndex].durationMinutes,
      );
      breakIndex += 1;
    }
    labels.push({
      label: `${formatMinutes(current)}-${formatMinutes(current + lessonDuration)}`,
      startMinutes: current,
      endMinutes: current + lessonDuration,
    });
    current += lessonDuration;
  }
  return labels;
}

function slotKey(day, row) {
  return `${day}::${row}`;
}

function parseUnavailable(value, days, timeSlots) {
  if (!value.trim()) return new Set();
  const unavailable = new Set();
  const dayLookup = new Map(days.map((day) => [day.toLowerCase(), day]));
  parseList(value).forEach((token) => {
    const lowered = token.toLowerCase();
    days.forEach((day) => {
      if (!lowered.startsWith(day.toLowerCase())) return;
      const timeText = cleanName(token.slice(day.length));
      const row = timeSlots.findIndex((slot) => slot.label.toLowerCase() === timeText.toLowerCase()) + 1;
      if (dayLookup.get(day.toLowerCase()) && row > 0) unavailable.add(slotKey(day, row));
    });
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

function renderBreaks() {
  els.breaksList.innerHTML = "";
  if (!state.breaks.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No breaks added yet.";
    els.breaksList.append(empty);
    return;
  }

  state.breaks.forEach((breakItem) => {
    const node = els.itemTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector("strong").textContent = breakItem.name;
    node.querySelector("span").textContent = `${breakItem.time} - ${formatDuration(breakItem.duration)}`;
    node.querySelector("button").addEventListener("click", () => {
      removeById(state.breaks, breakItem.id);
      renderBreaks();
      if (state.generated) renderTimetable(state.generated);
    });
    els.breaksList.append(node);
  });
}

function addBreak({ name, time, duration }) {
  const durationMinutes = Number(duration);
  const cleanBreak = {
    id: uid("break"),
    name: cleanName(name),
    time: cleanName(time),
    duration: durationMinutes,
  };
  if (!cleanBreak.name || parseTimeToMinutes(cleanBreak.time) === null || durationMinutes < 1) return false;
  const duplicate = state.breaks.some(
    (breakItem) =>
      normalizeTime(breakItem.time) === normalizeTime(cleanBreak.time) &&
      breakItem.name.toLowerCase() === cleanBreak.name.toLowerCase(),
  );
  if (duplicate) {
    showNotice("That break already exists.", "error");
    return false;
  }
  state.breaks.push(cleanBreak);
  return true;
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

function validateSetup(days, timeSlots, maxDaily, options) {
  const errors = [];
  const lessonDuration = Number(els.lessonDurationInput.value);
  if (days.length < 1) errors.push("Add at least one timetable column.");
  if (timeSlots.length < 1) errors.push("Add at least one timetable row.");
  if (parseTimeToMinutes(els.startTimeInput.value) === null) errors.push("Add a valid school start time.");
  if (lessonDuration < 5 || lessonDuration > 180) errors.push("Lesson duration must be between 5 and 180 minutes.");
  if (maxDaily < 1 || maxDaily > timeSlots.length) errors.push("Max teacher periods per day must fit inside the rows.");
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

function createEmptySchedule(days, timeSlots) {
  const schedule = {};
  const classes = state.classes.length ? state.classes : [{ id: "manual-class", name: "Timetable" }];
  classes.forEach((classItem) => {
    schedule[classItem.id] = {};
    days.forEach((day) => {
      schedule[classItem.id][day] = {};
      for (let row = 1; row <= timeSlots.length; row += 1) {
        schedule[classItem.id][day][row] = null;
      }
    });
  });
  return schedule;
}

function generateTimetable() {
  const days = parseDays();
  const timeSlots = parseTimeSlots();
  const maxDaily = Number(els.maxDailyInput.value);
  const options = buildOptions();
  const errors = validateSetup(days, timeSlots, maxDaily, options);

  if (errors.length) {
    showNotice(errors.join(" "), "error");
    return null;
  }

  const teacherUnavailable = new Map(
    state.teachers.map((teacher) => [
      teacher.id,
      parseUnavailable(teacher.unavailableText || "", days, timeSlots),
    ]),
  );
  const schedule = createEmptySchedule(days, timeSlots);
  const teacherBooked = new Map();
  const teacherDailyLoad = new Map();
  const classSubjectDaily = new Map();
  const placements = [];

  function canPlace(option, day, row) {
    const key = slotKey(day, row);
    const previous = row > 1 ? schedule[option.classId][day][row - 1] : null;
    if (schedule[option.classId][day][row]) return false;
    if (teacherBooked.get(`${option.teacherId}::${key}`)) return false;
    const unavailable = teacherUnavailable.get(option.teacherId);
    if (unavailable && unavailable.has(key)) return false;
    if ((teacherDailyLoad.get(`${option.teacherId}::${day}`) || 0) >= maxDaily) return false;
    if ((classSubjectDaily.get(`${option.classId}::${option.subjectId}::${day}`) || 0) >= 2) return false;
    if (previous && previous.subjectId === option.subjectId) return false;
    return true;
  }

  function place(option, day, row) {
    const key = slotKey(day, row);
    const placement = { ...option, id: `${option.id}-${day}-${row}` };
    schedule[option.classId][day][row] = placement;
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
      for (let row = 1; row <= timeSlots.length; row += 1) {
        const classOptions = options.filter((option) => option.classId === classItem.id);
        const candidates = shuffle(classOptions)
          .filter((option) => canPlace(option, day, row))
          .sort((a, b) => {
            const aSubjectLoad = classSubjectDaily.get(`${a.classId}::${a.subjectId}::${day}`) || 0;
            const bSubjectLoad = classSubjectDaily.get(`${b.classId}::${b.subjectId}::${day}`) || 0;
            const aTeacherLoad = teacherDailyLoad.get(`${a.teacherId}::${day}`) || 0;
            const bTeacherLoad = teacherDailyLoad.get(`${b.teacherId}::${day}`) || 0;
            return aSubjectLoad - bSubjectLoad || aTeacherLoad - bTeacherLoad;
          });
        if (candidates.length) place(candidates[0], day, row);
      }
    });
  });

  return { schedule, days, timeSlots, timeline: buildTimeline(timeSlots), tasks: placements };
}

function lookupTask(task) {
  if (!task) return null;
  if (task.manual) {
    return {
      subject: { name: task.subjectName || "" },
      teacher: { name: task.teacherName || "" },
    };
  }
  const subject = state.subjects.find((item) => item.id === task.subjectId);
  const teacher = state.teachers.find((item) => item.id === task.teacherId);
  return { subject, teacher };
}

function updateManualCell(classId, day, row, field, value) {
  if (!state.generated) return;
  const current = state.generated.schedule[classId][day][row];
  const detail = lookupTask(current) || { subject: { name: "" }, teacher: { name: "" } };
  const manual = {
    id: `manual-${classId}-${day}-${row}`,
    manual: true,
    subjectName: detail.subject ? detail.subject.name : "",
    teacherName: detail.teacher ? detail.teacher.name : "",
  };
  manual[field] = value;
  state.generated.schedule[classId][day][row] = manual.subjectName || manual.teacherName ? manual : null;
}

function createBreakRow(breakItem, columnCount) {
  const endMinutes = breakItem.startMinutes + breakItem.durationMinutes;
  const breakRow = document.createElement("tr");
  breakRow.innerHTML =
    `<td class="break-cell" colspan="${columnCount}">${escapeHtml(breakItem.name)}` +
    `<span>${escapeHtml(formatMinutes(breakItem.startMinutes))}-${escapeHtml(formatMinutes(endMinutes))} (${escapeHtml(formatDuration(breakItem.durationMinutes))})</span></td>`;
  return breakRow;
}

function createSimpleCell(text) {
  const cell = document.createElement("td");
  if (text) {
    cell.innerHTML = `<div class="lesson"><strong>${escapeHtml(text)}</strong></div>`;
  }
  return cell;
}

function buildTimeline(timeSlots) {
  const entries = [];
  const breaks = getSortedBreaks();
  let breakIndex = 0;
  timeSlots.forEach((slot, index) => {
    while (breakIndex < breaks.length && breaks[breakIndex].startMinutes <= slot.startMinutes) {
      entries.push({ type: "break", breakItem: breaks[breakIndex] });
      breakIndex += 1;
    }
    entries.push({ type: "lesson", slot, rowNumber: index + 1 });
  });
  while (breakIndex < breaks.length) {
    entries.push({ type: "break", breakItem: breaks[breakIndex] });
    breakIndex += 1;
  }
  return entries;
}

function findTeacherLesson(result, teacherId, day, rowNumber) {
  for (let index = 0; index < state.classes.length; index += 1) {
    const classItem = state.classes[index];
    const task = result.schedule[classItem.id][day][rowNumber];
    if (task && task.teacherId === teacherId) {
      const detail = lookupTask(task);
      return {
        className: classItem.name,
        subjectName: detail && detail.subject ? detail.subject.name : "",
      };
    }
  }
  return null;
}

function renderTeacherTimetables(result) {
  if (!state.teachers.length || !state.classes.length) return;

  const section = document.createElement("section");
  section.className = "teacher-section";
  const heading = document.createElement("div");
  heading.className = "section-heading";
  heading.innerHTML = "<h3>Teacher Timetables</h3>";
  section.append(heading);

  state.teachers.forEach((teacher) => {
    const wrapper = document.createElement("article");
    wrapper.className = "class-table teacher-table";
    const title = document.createElement("div");
    title.className = "class-title";
    title.innerHTML = `<h3>${escapeHtml(teacher.name)}</h3><span>Personal timetable</span>`;
    wrapper.append(title);

    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    headRow.innerHTML = "<th>Time</th>";
    result.days.forEach((day) => {
      const th = document.createElement("th");
      th.textContent = day;
      headRow.append(th);
    });
    thead.append(headRow);
    table.append(thead);

    const tbody = document.createElement("tbody");
    result.timeline.forEach((entry) => {
      if (entry.type === "break") {
        tbody.append(createBreakRow(entry.breakItem, result.days.length + 1));
        return;
      }

      const row = document.createElement("tr");
      const label = document.createElement("th");
      label.textContent = entry.slot.label;
      row.append(label);
      result.days.forEach((day) => {
        const lesson = findTeacherLesson(result, teacher.id, day, entry.rowNumber);
        const text = lesson ? `${lesson.subjectName} - ${lesson.className}` : "";
        row.append(createSimpleCell(text));
      });
      tbody.append(row);
    });
    table.append(tbody);
    wrapper.append(table);
    section.append(wrapper);
  });

  els.timetableArea.append(section);
}

function renderTimetable(result) {
  els.timetableArea.innerHTML = "";
  els.stats.innerHTML = "";

  if (!result) return;

  const tableClasses = state.classes.length ? state.classes : [{ id: "manual-class", name: "Timetable" }];
  const totalSlots = tableClasses.length * result.days.length * result.timeSlots.length;
  const usedSlots = result.tasks.length;
  const utilization = Math.round((usedSlots / totalSlots) * 100);
  const stats = [
    ["Tables", tableClasses.length],
    ["Teachers", state.teachers.length],
    ["Rows", result.timeSlots.length],
    ["Use", `${utilization}%`],
  ];

  stats.forEach(([label, value]) => {
    const stat = document.createElement("div");
    stat.className = "stat";
    stat.innerHTML = `<strong>${value}</strong><span>${label}</span>`;
    els.stats.append(stat);
  });

  tableClasses.forEach((classItem) => {
    const wrapper = document.createElement("article");
    wrapper.className = "class-table";
    const title = document.createElement("div");
    title.className = "class-title";
    title.innerHTML = `<h3>${classItem.name}</h3><span>${result.days.length} days</span>`;
    wrapper.append(title);

    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    headRow.innerHTML = "<th>Time</th>";
    result.days.forEach((day) => {
      const th = document.createElement("th");
      th.textContent = day;
      headRow.append(th);
    });
    thead.append(headRow);
    table.append(thead);

    const tbody = document.createElement("tbody");
    result.timeline.forEach((entry) => {
      if (entry.type === "break") {
        tbody.append(createBreakRow(entry.breakItem, result.days.length + 1));
        return;
      }

      const rowNumber = entry.rowNumber;
      const row = document.createElement("tr");
      const label = document.createElement("th");
      label.textContent = entry.slot.label;
      row.append(label);
      result.days.forEach((day) => {
        const cell = document.createElement("td");
        const task = result.schedule[classItem.id][day][rowNumber];
        const detail = lookupTask(task);
        const subjectValue = detail && detail.subject ? detail.subject.name : "";
        const teacherValue = detail && detail.teacher ? detail.teacher.name : "";
        cell.innerHTML = `
          <div class="editable-lesson">
            <input class="cell-subject" type="text" value="${escapeHtml(subjectValue)}" placeholder="Subject" />
            <input class="cell-teacher" type="text" value="${escapeHtml(teacherValue)}" placeholder="Teacher" />
          </div>
        `;
        cell.querySelector(".cell-subject").addEventListener("input", (event) => {
          updateManualCell(classItem.id, day, rowNumber, "subjectName", event.target.value);
        });
        cell.querySelector(".cell-teacher").addEventListener("input", (event) => {
          updateManualCell(classItem.id, day, rowNumber, "teacherName", event.target.value);
        });
        row.append(cell);
      });
      tbody.append(row);
    });
    table.append(tbody);
    wrapper.append(table);
    els.timetableArea.append(wrapper);
  });
  renderTeacherTimetables(result);

  els.resultTitle.textContent = "Timetable generated";
  els.exportButton.disabled = false;
  els.printButton.disabled = false;
  showNotice("Timetable built. You can edit any subject or teacher directly inside the table.", "success");
}

function exportCsv() {
  if (!state.generated) return;
  const rows = [["Class", "Column", "Time", "Subject", "Teacher"]];
  const tableClasses = state.classes.length ? state.classes : [{ id: "manual-class", name: "Timetable" }];
  tableClasses.forEach((classItem) => {
    state.generated.timeline.forEach((entry) => {
      if (entry.type === "break") {
        rows.push([
          classItem.name,
          "All",
          `${formatMinutes(entry.breakItem.startMinutes)}-${formatMinutes(
            entry.breakItem.startMinutes + entry.breakItem.durationMinutes,
          )}`,
          entry.breakItem.name,
          formatDuration(entry.breakItem.durationMinutes),
        ]);
        return;
      }

      state.generated.days.forEach((day) => {
        const rowNumber = entry.rowNumber;
        const task = state.generated.schedule[classItem.id][day][rowNumber];
        const detail = lookupTask(task);
        rows.push([
          classItem.name,
          day,
          entry.slot.label,
          detail && detail.subject ? detail.subject.name : "",
          detail && detail.teacher ? detail.teacher.name : "",
        ]);
      });
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
  state.breaks = [];
  resetOutput();
  showNotice("Add teacher loads, then use AI Generate to place subjects into the timetable automatically.");
  renderBreaks();
  renderLoads();
}

function loadSample() {
  clearAll();
  addBreak({ name: "Tea Break", time: "10:00", duration: 30 });
  addBreak({ name: "Lunch Break", time: "12:30", duration: 90 });
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
  renderBreaks();
  showNotice("Sample teacher loads added. Press AI Generate to create a timetable.", "success");
}

checkRequiredElements();

forEachNode(els.tabs, (tab) => tab.addEventListener("click", () => setActiveTab(tab.dataset.tab)));

els.breakForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const added = addBreak({
    name: els.breakNameInput.value,
    time: els.breakTimeInput.value,
    duration: els.breakDurationInput.value,
  });
  if (added) {
    els.breakNameInput.value = "";
    els.breakTimeInput.value = "";
    els.breakDurationInput.value = "";
    renderBreaks();
    if (state.generated) renderTimetable(state.generated);
    showNotice("Break added to the timetable skeleton.", "success");
  }
});

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

renderBreaks();
renderLoads();
