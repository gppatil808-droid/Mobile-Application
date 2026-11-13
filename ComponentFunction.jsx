const ComponentFunction = function () {
  // @section:imports @depends:[]
  const React = require('react');
  const { View, Text, TextInput, TouchableOpacity, ScrollView, StatusBar, StyleSheet, Platform, Alert, LayoutAnimation, useWindowDimensions } = require('react-native');
  const { Ionicons } = require('@react-native-vector-icons/ionicons');
  const { createBottomTabNavigator } = require('@react-navigation/bottom-tabs');
  const { createStackNavigator } = require('@react-navigation/stack');
  const { useSafeAreaInsets } = require('react-native-safe-area-context');
  const { useQuery, useMutation, useStorage, seedSampleRows, useSpeech } = require('platform-hooks');
  // @end:imports
  // @section:theme @depends:[]
  var TAB_MENU_HEIGHT = Platform.OS === 'web' ? 56 : 49;
  var SCROLL_EXTRA_PADDING = 16;
  var primaryColor = '#24566B', accentColor = '#176B9A', backgroundColor = '#EDF3F5', cardColor = '#FBFDFD';
  var textPrimary = '#172B33', textSecondary = '#4D636D', borderColor = '#C8D8DE', onAccentColor = '#FFFFFF';
  var accentSoftColor = '#D8EAF2';
  var radiusSm = 12, radiusMd = 20, radiusPill = 999;
  var visualDesign = 'A calm clinical palette, rounded inset cards, restrained dividers and generous 24-point page margins.';
  // @end:theme
  // @section:navigation-setup @depends:[]
  var Tab = createBottomTabNavigator();
  var Stack = createStackNavigator();
  var h = React.createElement;
  // @end:navigation-setup
  // @section:ThemeContext @depends:[theme]
  var ThemeContext = React.createContext(null);
  var ThemeProvider = function (props) {
    var mode = React.useState(false);
    return h(ThemeContext.Provider, {
      value: {
        theme: { colors: { primary: primaryColor, accent: accentColor, background: backgroundColor, card: cardColor, textPrimary: textPrimary, textSecondary: textSecondary } },
        darkMode: mode[0], toggleDarkMode: function () { mode[1](function (v) { return !v; }); }, visualDesign: visualDesign
      }
    }, props.children);
  };
  // @end:ThemeContext
  // @section:sample-data @depends:[]
  var med = function (name, details, time, label) { return { medicine_name: name, details: details, scheduled_times: [{ time: time, label: label }] }; };
  var SAMPLE_ROWS = {
    medicines: [
      med('Vitamin D3', '1 softgel · 1000 IU', '08:00', 'Morning'),
      med('Metformin', '1 tablet · 500 mg', '12:30', 'Afternoon'),
      med('Lisinopril', '1 tablet · 10 mg', '18:00', 'Evening'),
      med('Magnesium glycinate, evening formula', '2 capsules · 200 mg', '21:00', 'Evening'),
      med('Vitamin C', '1 tablet · 500 mg', '07:45', 'Morning')
    ]
  };
  var DEFAULT_TAKEN = {};
  // @end:sample-data
  // @section:shared-helpers @depends:[sample-data]
  var pad = function (n) { return String(n).padStart(2, '0'); };
  var parseTime = function (v) { var m = /^(\d{1,2}):(\d{2})$/.exec(String(v || '')); return m && { h: Number(m[1]), m: Number(m[2]) }; };
  var displayTime = function (v) { var t = parseTime(v); return t ? (t.h % 12 || 12) + ':' + pad(t.m) + (t.h < 12 ? ' AM' : ' PM') : String(v || ''); };
  var todayKey = function () { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  var dateLabel = function () { return new Intl.DateTimeFormat('en', { weekday: 'long', day: 'numeric', month: 'short' }).format(new Date()); };
  var timesOf = function (m) { return Array.isArray(m.scheduled_times) ? m.scheduled_times : []; };
  var timeOf = function (e) { return typeof e === 'string' ? e : (e && e.time) || ''; };
  var dosesFrom = function (medicines) {
    var doses = [];
    medicines.forEach(function (m) {
      timesOf(m).forEach(function (e, i) { var t = timeOf(e); if (t) doses.push({ key: m.id + '-' + i, medicine: m, time: t }); });
    });
    return doses.sort(function (a, b) { return a.time.localeCompare(b.time); });
  };
  var anim = function () { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); };
  var showError = function (msg) { if (Platform.OS === 'web') window.alert(msg); else Alert.alert('Dose Reminder', msg); };
  var confirmDelete = function (action) {
    if (Platform.OS === 'web') { if (window.confirm('Delete this medicine?')) action(); }
    else Alert.alert('Delete medicine?', 'This will remove its scheduled doses.', [
      { text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: action }
    ]);
  };

  var Btn = function (p) { return h(TouchableOpacity, Object.assign({ activeOpacity: 0.7 }, p)); };
  var Icon = function (name, size, color) { return h(Ionicons, { name: name, size: size || 24, color: color || primaryColor }); };
  var Button = function (p) {
    return h(Btn, { style: [styles.btn, p.secondary && styles.secondary, p.pill && styles.pill, p.style], onPress: p.onPress, disabled: p.disabled, componentId: p.id },
      p.icon ? Icon(p.icon, 20, p.secondary ? primaryColor : onAccentColor) : null,
      h(Text, { style: p.secondary ? styles.btnText2 : styles.btnText }, p.text));
  };

  var Header = function (p) {
    var k = p.id;
    return h(View, { style: styles.header, componentId: 'header-' + k },
      p.back ? h(Btn, { style: [styles.headerAction, { marginLeft: -12, marginRight: 8 }], onPress: p.back, componentId: k + '-close' }, Icon('close')) : null,
      h(View, { style: styles.grow, componentId: 'header-copy-' + k },
        h(Text, { style: styles.title, numberOfLines: 1, componentId: 'title-' + k }, p.title),
        p.subtitle ? h(Text, { style: styles.subtitle, componentId: 'subtitle-' + k }, p.subtitle) : null),
      p.action ? h(Btn, { style: styles.headerAction, onPress: p.action, componentId: 'header-action-' + k, accessibilityLabel: p.actionLabel || 'Action' }, Icon(p.icon || 'add')) : null);
  };

  // Shared screen shell: header + scroll area (+ optional pinned footer)
  var Screen = function (p) {
    var insets = useSafeAreaInsets();
    var height = useWindowDimensions().height;
    return h(View, { style: styles.screen, componentId: p.id + '-screen' },
      h(StatusBar, { backgroundColor: backgroundColor, barStyle: 'dark-content' }),
      h(Header, p),
      h(ScrollView, {
        style: { height: height - insets.top - insets.bottom - 64 - (p.footer ? 76 : 0) },
        keyboardShouldPersistTaps: 'handled',
        contentContainerStyle: { paddingTop: 16, paddingHorizontal: 24, flexGrow: 1, paddingBottom: (p.footer ? 0 : TAB_MENU_HEIGHT) + insets.bottom + SCROLL_EXTRA_PADDING },
        componentId: p.id + '-scroll'
      }, p.children),
      p.footer ? h(View, { style: [styles.pinnedAction, { paddingBottom: insets.bottom + 12 }], componentId: p.id + '-pinned' }, p.footer) : null);
  };

  var Empty = function (p) {
    var box = p.big ? 88 : 64;
    return h(View, { style: styles.empty, componentId: p.id },
      h(View, { style: [styles.mark, { width: box, height: box }], componentId: p.id + '-mark' }, Icon(p.icon, p.big ? 40 : 28)),
      h(Text, { style: [styles.sectionTitle, { marginBottom: 0 }], componentId: p.id + '-title' }, p.title),
      h(Text, { style: styles.emptyCopy, componentId: p.id + '-copy' }, p.copy),
      p.children);
  };

  var DoseRow = function (p) {
    var d = p.dose, name = d.medicine.medicine_name || 'Unnamed medicine';
    return h(View, { style: [styles.doseRow, p.divider && styles.divider], componentId: 'dose-row-' + d.key },
      h(Btn, { style: styles.checkTarget, onPress: p.onToggle, componentId: 'dose-check-' + d.key, accessibilityLabel: 'Mark ' + name + (p.taken ? ' not taken' : ' taken') },
        h(View, { style: [styles.checkBox, p.taken && styles.checkBoxDone] }, p.taken ? Icon('checkmark', 16, onAccentColor) : null)),
      h(View, { style: styles.grow, componentId: 'dose-copy-' + d.key },
        h(Text, { style: [styles.rowName, p.taken && styles.takenName], numberOfLines: 1 }, name),
        h(Text, { style: styles.rowDetail, numberOfLines: 1 }, d.medicine.details || 'Medicine details')),
      h(Btn, { style: styles.timeTarget, onPress: p.onSpeak, componentId: 'dose-time-' + d.key, accessibilityLabel: 'Announce ' + name + ' dose' },
        h(Text, { style: styles.rowTime }, displayTime(d.time))));
  };

  var DoseList = function (p) {
    return h(View, { style: styles.listCard, componentId: p.id },
      p.doses.length ? p.doses.map(function (d, i) {
        return h(DoseRow, { key: d.key, dose: d, divider: i > 0, taken: p.taken, onToggle: function () { p.api.toggle(d); }, onSpeak: function () { p.api.announce(d); } });
      }) : h(Text, { style: styles.emptyLine }, p.emptyText));
  };

  var TakenHeading = function (p) {
    return h(View, { style: styles.takenHeading, componentId: 'taken-heading-' + p.location },
      Icon('checkmark-circle', 18, textSecondary),
      h(Text, { style: styles.takenLabel }, 'Taken · ' + p.count + (p.count === 1 ? ' dose' : ' doses')));
  };

  // Shared by Today + History: doses, taken state, toggle, spoken announcement
  var useDoses = function () {
    var query = useQuery('medicines'), store = useStorage('dose-taken', DEFAULT_TAKEN), speech = useSpeech();
    var taken = store[0] || {}, day = todayKey(), doses = dosesFrom(query.data);
    var isDone = function (d) { return !!taken[day + ':' + d.key]; };
    return {
      doses: doses,
      completed: doses.filter(isDone),
      scheduled: doses.filter(function (d) { return !isDone(d); }),
      toggle: function (d) {
        anim();
        store[1](function (prev) {
          var u = Object.assign({}, prev || {}), k = day + ':' + d.key;
          if (u[k]) delete u[k]; else u[k] = true;
          return u;
        }).catch(function (e) { showError(e.message || 'Could not save dose.'); });
      },
      announce: function (d) {
        speech.speak('Reminder. Take ' + (d.medicine.medicine_name || 'your medicine') + '. ' + (d.medicine.details || '') + '. Scheduled for ' + displayTime(d.time) + '.', { language: 'en-US' })
          .catch(function (e) { showError(e.message || 'Could not announce this dose.'); });
      }
    };
  };
  // @end:shared-helpers
  // @section:TodayScreen @depends:[ThemeContext,shared-helpers,styles]
  var TodayScreen = function (props) {
    var api = useDoses(), now = new Date(), cur = now.getHours() * 60 + now.getMinutes();
    var next = api.scheduled.find(function (d) { var t = parseTime(d.time); return t.h * 60 + t.m >= cur; }) || api.scheduled[0];
    var go = function (screen) { return function () { props.navigation.navigate(screen); }; };
    return h(Screen, { id: 'today', title: 'Today', subtitle: dateLabel(), icon: 'notifications-outline', actionLabel: 'View medicines', action: go('Medicines') },
      !api.doses.length
        ? h(Empty, { id: 'today-empty', icon: 'medkit-outline', title: 'Your schedule starts here', copy: 'Add your first medicine and its scheduled times. Upcoming doses and spoken reminders will appear here.' },
          h(Button, { id: 'today-add-button', pill: true, icon: 'add', text: 'Add medicine', onPress: go('AddMedicine') }))
        : h(View, { componentId: 'today-content' },
          next ? h(View, { style: styles.nextDose, componentId: 'today-next-dose' }, Icon('time-outline', 20), h(Text, { style: styles.nextText }, 'Next dose · ' + displayTime(next.time))) : null,
          h(Text, { style: styles.sectionTitle }, 'Scheduled'),
          h(DoseList, { id: 'today-scheduled-list', doses: api.scheduled, taken: false, api: api, emptyText: 'All scheduled doses are taken.' }),
          api.completed.length ? h(View, { componentId: 'today-taken-section' },
            h(TakenHeading, { count: api.completed.length, location: 'today' }),
            h(DoseList, { id: 'today-taken-list', doses: api.completed, taken: true, api: api })) : null));
  };
  // @end:TodayScreen
  // @section:MedicinesScreen @depends:[ThemeContext,shared-helpers,styles]
  var MedicinesScreen = function (props) {
    var query = useQuery('medicines'), remove = useMutation('medicines', 'delete'), meds = query.data;
    var go = function (params) { props.navigation.navigate('AddMedicine', params); };
    var del = function (m) {
      confirmDelete(function () {
        anim();
        remove.mutate({ id: m.id }).then(function () { query.refetch(); }).catch(function (e) { showError(e.message || 'Could not delete medicine.'); });
      });
    };
    return h(Screen, { id: 'medicines', title: 'Medicines', actionLabel: 'Add medicine', action: function () { go(); } },
      meds.length
        ? h(View, { componentId: 'medicines-content' },
          h(Text, { style: styles.sectionTitle }, 'Your medicines'),
          h(View, { style: styles.listCard, componentId: 'medicines-list' }, meds.map(function (m, i) {
            var t = timeOf(timesOf(m)[0]);
            return h(Btn, {
              key: String(m.id), style: [styles.medicineRow, i > 0 && styles.divider], componentId: 'medicine-row-' + i,
              onPress: function () { go({ medicineId: m.id }); }, onLongPress: function () { del(m); },
              accessibilityLabel: 'Edit ' + (m.medicine_name || 'medicine') + '. Long press to delete.'
            },
              h(View, { style: styles.grow },
                h(Text, { style: styles.rowName, numberOfLines: 1 }, m.medicine_name || 'Unnamed medicine'),
                h(Text, { style: styles.rowDetail, numberOfLines: 1 }, m.details || 'No details'),
                h(Text, { style: styles.rowDetail, numberOfLines: 1 }, 'Every day · ' + (t ? displayTime(t) : 'No time'))),
              h(Text, { style: styles.rowTime }, 'Daily'));
          })),
          h(Text, { style: styles.helperText }, 'Tap a medicine to edit. Touch and hold to delete.'))
        : h(Empty, { id: 'medicines-empty', big: true, icon: 'medkit-outline', title: 'Keep your medicines together', copy: 'Add a medicine and its scheduled times to see your reminders here.' },
          h(Button, { id: 'medicines-add-button', icon: 'add', text: 'Add medicine', style: { alignSelf: 'stretch', marginTop: 24 }, onPress: function () { go(); } }),
          h(Button, { id: 'medicines-voice-button', secondary: true, icon: 'mic-outline', text: 'Speak medicine details', style: { alignSelf: 'stretch', marginTop: 8 }, onPress: function () { go({ voice: true }); } }),
          h(Text, { style: styles.helperText }, 'You can say the name, dose and times.')));
  };
  // @end:MedicinesScreen
  // @section:HistoryScreen @depends:[ThemeContext,shared-helpers,styles]
  var HistoryScreen = function () {
    var api = useDoses();
    return h(Screen, { id: 'history', title: 'History', subtitle: dateLabel() },
      api.doses.length
        ? h(View, { componentId: 'history-content' },
          h(Text, { style: styles.historyIntro }, 'Today’s doses'),
          h(TakenHeading, { count: api.completed.length, location: 'history' }),
          h(DoseList, { id: 'history-taken-list', doses: api.completed, taken: true, api: api, emptyText: 'No doses marked taken yet.' }),
          h(Text, { style: [styles.sectionTitle, { marginTop: 24 }] }, 'Scheduled'),
          h(DoseList, { id: 'history-scheduled-list', doses: api.scheduled, taken: false, api: api, emptyText: 'All scheduled doses are taken.' }))
        : h(Empty, { id: 'history-empty', icon: 'time-outline', title: 'Your doses, in one place', copy: 'Recorded doses will appear here once you start tracking medicines.' }));
  };
  // @end:HistoryScreen
  // @section:SettingsScreen @depends:[ThemeContext,styles]
  var SettingsScreen = function () {
    var speech = useSpeech();
    var test = function () {
      speech.speak('Dose Reminder will announce your medicine name, details and scheduled time.', { language: 'en-US' })
        .catch(function (e) { showError(e.message || 'Could not play the announcement.'); });
    };
    return h(Screen, { id: 'settings', title: 'Settings' },
      h(Text, { style: styles.sectionTitle }, 'Announcements'),
      h(View, { style: styles.listCard },
        h(Btn, { style: styles.settingsRow, onPress: test, componentId: 'settings-test-voice' },
          Icon('volume-high-outline'),
          h(View, { style: { flex: 1 } },
            h(Text, { style: styles.rowName }, 'Test spoken reminder'),
            h(Text, { style: styles.rowDetail }, 'Hear a sample announcement')),
          Icon('chevron-forward', 20, textSecondary))),
      h(Text, { style: styles.helperText }, 'Open Today to review your doses and tap a scheduled time to hear its announcement.'));
  };
  // @end:SettingsScreen
  // @section:AddMedicineScreen @depends:[ThemeContext,shared-helpers,styles]
  var FIELDS = [['name', 'Medicine name', 'Medicine name'], ['strength', 'Strength', 'e.g. 500 mg tablet'], ['dose', 'Dose', 'e.g. 1 tablet']];
  var blankTime = function () { return { label: '', note: '', time: '' }; };

  var AddMedicineScreen = function (props) {
    var query = useQuery('medicines'), insert = useMutation('medicines', 'insert'), update = useMutation('medicines', 'update'), speech = useSpeech();
    var medicineId = props.route && props.route.params ? props.route.params.medicineId : null;
    var existing = medicineId ? query.data.find(function (m) { return m.id === medicineId; }) : null;
    var formState = React.useState({ name: '', strength: '', dose: '' }), form = formState[0];
    var timesState = React.useState([blankTime()]), times = timesState[0], setTimes = timesState[1];
    var savingState = React.useState(false), saving = savingState[0], setSaving = savingState[1];
    var initialized = React.useRef(null);
    var setField = function (k, v) { formState[1](function (f) { return Object.assign({}, f, { [k]: v }); }); };

    React.useEffect(function () {
      if (!existing || initialized.current === existing.id) return;
      initialized.current = existing.id;
      var parts = String(existing.details || '').split(' · ');
      formState[1]({ name: existing.medicine_name || '', dose: parts[0] || '', strength: parts.slice(1).join(' · ') });
      var saved = timesOf(existing).map(function (e) {
        return typeof e === 'string' ? { label: '', note: '', time: e } : { label: e.label || '', note: e.note || '', time: e.time || '' };
      });
      setTimes(saved.length ? saved : [blankTime()]);
    }, [existing && existing.id]);

    var changeTime = function (i, k, v) {
      setTimes(times.map(function (t, j) {
        return j !== i ? t : Object.assign({}, t, { [k]: k === 'time' ? v.replace(/[^0-9:]/g, '').slice(0, 5) : v });
      }));
    };

    var save = function () {
      if (!form.name.trim()) return showError('Enter a medicine name.');
      var valid = times.filter(function (t) { return t.time.trim(); });
      if (!valid.length) return showError('Add at least one scheduled time.');
      if (valid.some(function (t) { var p = parseTime(t.time); return !p || p.h > 23 || p.m > 59; })) return showError('Enter each time in 24-hour HH:MM format, such as 08:00.');
      var payload = { medicine_name: form.name.trim(), details: [form.dose.trim(), form.strength.trim()].filter(Boolean).join(' · '), scheduled_times: valid };
      setSaving(true);
      (medicineId && existing ? update.mutate({ id: medicineId, data: payload }) : insert.mutate(payload)).then(
        function () { setSaving(false); query.refetch(); props.navigation.goBack(); },
        function (e) { setSaving(false); showError(e.message || 'Could not save medicine.'); });
    };

    var voice = function () {
      if (!speech.isSttAvailable) return showError('Voice input is not available on this device.');
      if (speech.isListening) {
        speech.stopListening();
        if (speech.transcript) setField('name', speech.transcript.trim());
      } else {
        speech.startListening({ lang: 'en-US', interimResults: true, continuous: false })
          .catch(function (e) { showError(e.message || 'Could not start voice input.'); });
      }
    };

    var input = function (style, k, value, onChange, placeholder, extra) {
      return h(TextInput, Object.assign({ style: style, value: value, onChangeText: onChange, placeholder: placeholder, placeholderTextColor: textSecondary, keyboardType: 'default', componentId: k }, extra));
    };

    return h(Screen, {
      id: 'add-medicine', title: existing ? 'Edit Medicine' : 'Add Medicine', back: function () { props.navigation.goBack(); },
      footer: h(Button, { id: 'add-save', text: saving ? 'Saving…' : 'Save Medicine', disabled: saving, onPress: save })
    },
      h(Btn, { style: styles.voiceEntry, onPress: voice, componentId: 'add-voice-entry' },
        Icon('mic-outline'),
        h(Text, { style: styles.voiceCopy, numberOfLines: 1 }, speech.isListening ? 'Listening… tap to finish' : 'Say medicine details'),
        h(Text, { style: styles.voiceLabel }, 'Voice')),
      speech.transcript ? h(Text, { style: styles.helperText }, speech.transcript) : null,
      h(Text, { style: [styles.sectionTitle, { marginTop: 24 }] }, 'Medicine details'),
      h(View, { style: styles.listCard, componentId: 'add-fields' }, FIELDS.map(function (f, i) {
        var isName = f[0] === 'name';
        return h(View, { key: f[0], style: [styles.formField, i > 0 && styles.divider] },
          h(Text, { style: styles.fieldLabel }, f[1]),
          input(styles.fieldInput, 'add-input-' + f[0], form[f[0]], function (v) { setField(f[0], v); }, f[2], { autoCapitalize: isName ? 'words' : 'sentences', autoCorrect: !isName }));
      })),
      h(Text, { style: [styles.sectionTitle, { marginTop: 24 }] }, 'Scheduled times'),
      h(View, { style: styles.listCard, componentId: 'add-times-list' },
        times.map(function (t, i) {
          return h(View, { key: String(i), style: [styles.scheduleEditor, i > 0 && styles.divider], componentId: 'add-time-row-' + i },
            h(View, { style: { flex: 1 } },
              input(styles.scheduleNameInput, 'add-time-label-' + i, t.label, function (v) { changeTime(i, 'label', v); }, 'Morning / Evening', { autoCapitalize: 'words', autoCorrect: false }),
              input(styles.scheduleNoteInput, 'add-time-note-' + i, t.note, function (v) { changeTime(i, 'note', v); }, 'With breakfast', { autoCapitalize: 'sentences', autoCorrect: true })),
            input(styles.timeInput, 'add-time-value-' + i, t.time, function (v) { changeTime(i, 'time', v); }, 'HH:MM', { keyboardType: 'numbers-and-punctuation', autoCapitalize: 'none', autoCorrect: false }),
            times.length > 1 ? h(Btn, {
              style: styles.headerAction, accessibilityLabel: 'Remove scheduled time', componentId: 'add-remove-time-' + i,
              onPress: function () { anim(); setTimes(times.filter(function (_, j) { return j !== i; })); }
            }, Icon('close', 20)) : null);
        }),
        h(Btn, { style: [styles.addTime, styles.divider], componentId: 'add-another-time', onPress: function () { anim(); setTimes(times.concat([blankTime()])); } },
          Icon('add', 20), h(Text, { style: styles.addTimeText }, 'Add a time'))),
      h(Text, { style: [styles.helperText, { marginTop: 16 }] }, 'Dose Reminder will announce the medicine name, dose, and scheduled time.'));
  };
  // @end:AddMedicineScreen
  // @section:styles @depends:[theme]
  var T = function (color, size, lineHeight, weight) { return weight ? { color: color, fontSize: size, lineHeight: lineHeight, fontWeight: weight } : { color: color, fontSize: size, lineHeight: lineHeight }; };
  var row = { flexDirection: 'row', alignItems: 'center' };
  var ctr = { alignItems: 'center', justifyContent: 'center' };
  const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: backgroundColor },
    header: { ...row, height: 64, paddingHorizontal: 24 },
    title: { ...T(textPrimary, 32, 39, '700'), letterSpacing: -0.6, flexShrink: 1 },
    subtitle: { ...T(textSecondary, 13, 16, '500'), marginTop: 4 },
    headerAction: { ...ctr, width: 48, height: 48 },
    grow: { flex: 1, minWidth: 0 },
    nextDose: { ...row, minHeight: 52, borderRadius: radiusMd, backgroundColor: accentSoftColor, paddingHorizontal: 16, marginBottom: 20, gap: 12 },
    nextText: T(primaryColor, 15, 18, '600'),
    sectionTitle: { ...T(textPrimary, 20, 24, '600'), marginLeft: 2, marginBottom: 12 },
    listCard: { backgroundColor: cardColor, borderRadius: radiusMd, overflow: 'hidden' },
    doseRow: { ...row, minHeight: 76, paddingVertical: 12, paddingHorizontal: 8, gap: 4 },
    divider: { borderTopWidth: 1, borderTopColor: borderColor },
    checkTarget: { ...ctr, width: 48, height: 48 },
    checkBox: { ...ctr, width: 24, height: 24, borderWidth: 2, borderColor: borderColor, borderRadius: 8 },
    checkBoxDone: { backgroundColor: accentColor, borderColor: accentColor },
    rowName: T(textPrimary, 16, 19, '600'),
    takenName: { color: textSecondary, textDecorationLine: 'line-through' },
    rowDetail: { ...T(textSecondary, 13, 16), marginTop: 4 },
    rowTime: T(textSecondary, 13, 16, '500'),
    timeTarget: { minHeight: 48, minWidth: 60, alignItems: 'flex-end', justifyContent: 'center', paddingRight: 8 },
    takenHeading: { ...row, marginTop: 24, marginBottom: 12, marginHorizontal: 2, gap: 8 },
    takenLabel: T(textSecondary, 13, 16, '600'),
    emptyLine: { ...T(textSecondary, 15, 20), padding: 20 },
    medicineRow: { ...row, minHeight: 96, paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
    helperText: { ...T(textSecondary, 13, 18), marginTop: 12, marginHorizontal: 2 },
    historyIntro: T(textSecondary, 15, 18),
    empty: { ...ctr, minHeight: 480, paddingHorizontal: 16 },
    mark: { ...ctr, borderRadius: radiusMd, backgroundColor: accentSoftColor, marginBottom: 24 },
    emptyCopy: { ...T(textSecondary, 15, 20), maxWidth: 290, textAlign: 'center', marginTop: 8 },
    btn: { ...ctr, flexDirection: 'row', minHeight: 52, minWidth: 48, borderRadius: radiusSm, backgroundColor: accentColor, gap: 8, paddingHorizontal: 16 },
    pill: { borderRadius: radiusPill, paddingHorizontal: 24, marginTop: 24 },
    secondary: { backgroundColor: cardColor },
    btnText: T(onAccentColor, 16, 19, '600'),
    btnText2: T(primaryColor, 16, 19, '600'),
    settingsRow: { ...row, minHeight: 76, paddingHorizontal: 16, gap: 12 },
    voiceEntry: { ...row, minHeight: 56, gap: 12, paddingHorizontal: 16, backgroundColor: accentSoftColor, borderRadius: radiusMd },
    voiceCopy: { ...T(primaryColor, 15, 18, '600'), flex: 1 },
    voiceLabel: T(primaryColor, 13, 16, '600'),
    formField: { minHeight: 72, paddingVertical: 12, paddingHorizontal: 16, justifyContent: 'center' },
    fieldLabel: T(textSecondary, 13, 16, '500'),
    fieldInput: { ...T(textPrimary, 16, 19, '600'), padding: 0, marginTop: 4, minHeight: 24 },
    scheduleEditor: { ...row, minHeight: 72, paddingLeft: 16, paddingRight: 8, gap: 8 },
    scheduleNameInput: { ...T(textPrimary, 16, 19, '600'), padding: 0, minHeight: 24 },
    scheduleNoteInput: { ...T(textSecondary, 13, 16), padding: 0, marginTop: 4, minHeight: 20 },
    timeInput: { ...T(primaryColor, 15, 18, '600'), minWidth: 64, textAlign: 'right', padding: 0 },
    addTime: { ...row, minHeight: 48, paddingHorizontal: 16, gap: 8 },
    addTimeText: T(primaryColor, 15, 18, '600'),
    pinnedAction: { paddingTop: 12, paddingHorizontal: 24, backgroundColor: backgroundColor }
  });
  // @end:styles
  // @section:TabNavigator @depends:[TodayScreen,MedicinesScreen,HistoryScreen,SettingsScreen,navigation-setup]
  var TABS = [['Today', TodayScreen, 'home'], ['Medicines', MedicinesScreen, 'medkit'], ['History', HistoryScreen, 'time'], ['Settings', SettingsScreen, 'settings']];
  var TabNavigator = function () {
    var insets = useSafeAreaInsets();
    return h(View, { style: { flex: 1, width: '100%', height: '100%', overflow: 'hidden' }, componentId: 'tab-shell' },
      h(Tab.Navigator, {
        screenOptions: {
          headerShown: false, hikariLiquidGlass: true,
          tabBarActiveTintColor: primaryColor, tabBarInactiveTintColor: textSecondary,
          tabBarActiveBackgroundColor: cardColor, tabBarInactiveBackgroundColor: cardColor,
          tabBarLabelStyle: { fontSize: 11, lineHeight: 13, fontWeight: '600' },
          tabBarItemStyle: { padding: 0 },
          tabBarStyle: { position: 'absolute', bottom: 0, height: Platform.OS === 'web' ? TAB_MENU_HEIGHT : TAB_MENU_HEIGHT + insets.bottom, paddingBottom: 0, borderTopWidth: 0, backgroundColor: cardColor }
        }
      }, TABS.map(function (t) {
        return h(Tab.Screen, {
          key: t[0], name: t[0], component: t[1],
          options: { tabBarIcon: function (i) { return Icon(t[2] + (i.focused ? '' : '-outline'), 24, i.color); } }
        });
      })));
  };
  // @end:TabNavigator
  // @section:MainNavigator @depends:[TabNavigator,AddMedicineScreen,navigation-setup]
  var MainNavigator = function () {
    return h(Stack.Navigator, { screenOptions: { headerShown: false }, initialRouteName: 'MainApp' },
      h(Stack.Screen, { name: 'MainApp', component: TabNavigator }),
      h(Stack.Screen, { name: 'AddMedicine', component: AddMedicineScreen, initialParams: { medicineId: null } }));
  };
  // @end:MainNavigator
  // @section:return @depends:[ThemeProvider,MainNavigator,sample-data]
  if (seedSampleRows) seedSampleRows(SAMPLE_ROWS);
  return h(ThemeProvider, null, h(View, { style: { flex: 1, width: '100%', height: '100%' }, componentId: 'app-root' }, h(MainNavigator)));
  // @end:return
};
return ComponentFunction;
