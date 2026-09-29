import { useEffect, useState, type ReactNode } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import StepTracker, { type Profile, type Sex, type WeighReminder } from '../../../modules/step-tracker';
import { ACTIVITY_LEVELS, strideFromCalibration } from '../../lib/calc';
import { formatLongDate, formatShortDate, isValidKey, WEEKDAY_SHORT } from '../../lib/dates';
import { fmt1, fmtInt, parseDecimal } from '../../lib/format';
import { minHealthyWeight, stepsImpact, validateGoal } from '../../lib/goal';
import { requestNotifications } from '../../lib/permissions';
import { useHealth } from '../../state/HealthContext';
import { EXTRA_STEPS, useGoalModel } from '../../state/useGoalModel';
import { GoalChart } from '../../ui/charts';
import {
  Button,
  Card,
  Field,
  Footnote,
  Group,
  Icon,
  IconButton,
  Notice,
  Row,
  Screen,
  SectionLabel,
  Segmented,
  SwitchRow,
  Title,
} from '../../ui/components';
import { useOverlay } from '../../ui/Overlay';
import { radius, useColors } from '../../ui/theme';

const str = (n: number | null | undefined) => (n == null ? '' : String(n).replace('.', ','));
const kg = (n: number) => `${fmt1(n)} kg`;
const signedKcal = (n: number) => `${n > 0 ? '+' : '−'}${fmtInt(Math.abs(n))} kcal`;

export default function GoalScreen() {
  const c = useColors();
  const model = useGoalModel();
  const { profile, weights, saveProfile, addWeight, deleteWeight } = useHealth();
  const [chartWidth, setChartWidth] = useState(0);
  const [editingGoal, setEditingGoal] = useState(false);
  const [showAllWeights, setShowAllWeights] = useState(false);

  if (!model || !profile) return null;
  const { today } = model;
  const hasGoal = model.goalKg != null && !editingGoal;

  return (
    <Screen title="Hedef">
      {hasGoal && model.progress ? (
        <GoalHero model={model} onEdit={() => setEditingGoal(true)} />
      ) : (
        <GoalSetup
          currentKg={model.currentKg}
          heightCm={profile.heightCm}
          initialGoal={profile.goalWeightKg}
          onCancel={profile.goalWeightKg != null ? () => setEditingGoal(false) : undefined}
          onSave={async (goalKg) => {
            await saveProfile({ ...profile, goalWeightKg: goalKg, goalStartDate: today, goalStartWeightKg: model.currentKg });
            setEditingGoal(false);
          }}
        />
      )}

      {model.fastLoss ? (
        <Notice
          tone="warning"
          icon="speedometer"
          title="Çok hızlı kilo kaybı"
          text="Haftada vücut ağırlığının %1'inden fazlasını kaybediyorsun. Sürdürülebilir ve güvenli bir hız için beslenmeni çok kısıtlamamaya dikkat et; gerekirse bir sağlık profesyoneline danış."
        />
      ) : null}

      <DailyLimitCard model={model} profile={profile} onSaveProfile={saveProfile} />
      <StepsImpactCard model={model} />
      <ScaleCard model={model} />

      {model.trend.length > 0 ? (
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Title>Kilo eğilimi</Title>
            {model.currentKg != null ? <Text style={{ color: c.textMuted, fontSize: 14 }}>şu an ~{kg(model.currentKg)}</Text> : null}
          </View>
          {model.trend.length > 1 ? (
            <>
              <View onLayout={(e) => setChartWidth(e.nativeEvent.layout.width)}>
                <GoalChart
                  points={model.trend.slice(-40)}
                  goalKg={hasGoal ? model.goalKg : null}
                  today={today}
                  etaDate={model.projection?.kind === 'on_track' ? model.projection.etaDate : null}
                  width={chartWidth}
                />
              </View>
              <Text style={{ color: c.textFaint, fontSize: 12.5 }}>
                Noktalar tartı ölçümleri, çizgi günlük dalgalanmadan arındırılmış eğilimdir.
              </Text>
            </>
          ) : (
            <Text style={{ color: c.textMuted, fontSize: 14, lineHeight: 20 }}>
              Grafik ikinci ölçümden sonra oluşur. Hatırlatıcıyı açarsan haftada iki kez sabah haber veririm.
            </Text>
          )}
        </Card>
      ) : null}

      <SectionLabel>Tartı</SectionLabel>
      <AddWeight today={today} onAdd={addWeight} />
      {weights.length > 0 ? (
        <Group>
          {(showAllWeights ? weights : weights.slice(0, 5)).map((w) => (
            <Row
              key={w.id}
              title={kg(w.weightKg)}
              subtitle={formatLongDate(w.date)}
              right={
                <IconButton
                  icon="trash-can-outline"
                  label={`${w.date} ölçümünü sil`}
                  color={c.textMuted}
                  onPress={() =>
                    Alert.alert('Ölçüm silinsin mi?', `${formatShortDate(w.date)} · ${kg(w.weightKg)}`, [
                      { text: 'Vazgeç', style: 'cancel' },
                      { text: 'Sil', style: 'destructive', onPress: () => deleteWeight(w.id) },
                    ])
                  }
                />
              }
            />
          ))}
          {weights.length > 5 ? (
            <Row
              icon={showAllWeights ? 'chevron-up' : 'history'}
              title={showAllWeights ? 'Daha az göster' : `Tüm ölçümler (${weights.length})`}
              onPress={() => setShowAllWeights((v) => !v)}
              right={null}
            />
          ) : null}
        </Group>
      ) : null}
      <ReminderSettings />

      <Footnote>
        Tüm değerler tahmindir ve tıbbi tavsiye değildir. Hamilelik, emzirme, kronik hastalık ya da yeme bozukluğu geçmişi
        varsa kilo hedefini bir sağlık profesyoneliyle belirle.
      </Footnote>
    </Screen>
  );
}

type Model = NonNullable<ReturnType<typeof useGoalModel>>;

// ---------------------------------------------------------------------------------------------

function GoalHero({ model, onEdit }: { model: Model; onEdit: () => void }) {
  const c = useColors();
  const p = model.progress!;
  const projection = model.projection;
  let paceText: string;
  if (projection?.kind === 'reached') paceText = 'Hedefine ulaştın. Yeni bir hedef belirleyebilirsin.';
  else if (projection?.kind === 'on_track') {
    paceText = `Bu hızla ${formatShortDate(projection.etaDate)} ${projection.etaDate.slice(0, 4)} civarı (${Math.max(1, Math.round(projection.weeks))} hafta)`;
  } else if (projection?.kind === 'not_losing') paceText = 'Son haftalarda kilon düşmüyor. Adımlarını artırmak ya da sınırın altında kalmak işe yarar.';
  else {
    const rate = model.rate;
    const have = rate.kind === 'collecting' ? rate.points : 0;
    paceText = `Tahmin için en az 10 güne yayılmış 3 tartı gerekiyor (şu an ${have}).`;
  }

  return (
    <Card style={{ gap: 16 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: c.textMuted, fontSize: 14, fontWeight: '600' }}>
          {kg(p.startKg)} → <Text style={{ color: c.accent, fontWeight: '800' }}>{kg(p.goalKg)}</Text>
        </Text>
        <Button kind="ghost" compact icon="pencil-outline" label="Düzenle" onPress={onEdit} />
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <View>
          <Text style={{ color: c.textMuted, fontSize: 13, fontWeight: '600' }}>Kalan</Text>
          <Text style={{ color: c.text, fontSize: 44, fontWeight: '800', letterSpacing: -1.2, fontVariant: ['tabular-nums'] }}>
            {fmt1(p.remainingKg)}
            <Text style={{ fontSize: 20, color: c.textMuted }}> kg</Text>
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ color: c.textMuted, fontSize: 13, fontWeight: '600' }}>Verilen</Text>
          <Text style={{ color: p.lostKg >= 0 ? c.accent : c.paused, fontSize: 24, fontWeight: '800', fontVariant: ['tabular-nums'] }}>
            {p.lostKg >= 0 ? '−' : '+'}
            {fmt1(Math.abs(p.lostKg))} kg
          </Text>
        </View>
      </View>

      <View style={{ height: 12, borderRadius: 6, backgroundColor: c.track, overflow: 'hidden' }}>
        <View style={{ width: `${p.fraction * 100}%`, height: '100%', borderRadius: 6, backgroundColor: c.accent }} />
      </View>
      <Text style={{ color: c.textMuted, fontSize: 14, lineHeight: 20 }}>{paceText}</Text>
    </Card>
  );
}

function GoalSetup({
  currentKg,
  heightCm,
  initialGoal,
  onSave,
  onCancel,
}: {
  currentKg: number | null;
  heightCm: number | null;
  initialGoal: number | null;
  onSave: (goalKg: number) => Promise<void>;
  onCancel?: () => void;
}) {
  const c = useColors();
  const [text, setText] = useState(str(initialGoal));
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    const goal = parseDecimal(text);
    const problem = goal == null ? 'Hedef kilonu gir.' : validateGoal(goal, currentKg, heightCm);
    if (problem) return setError(problem);
    await onSave(Math.round(goal! * 10) / 10);
  };
  return (
    <Card>
      <Title>Hedefini belirle</Title>
      <Text style={{ color: c.textMuted, fontSize: 14, lineHeight: 20 }}>
        {currentKg == null
          ? 'Önce aşağıdan bir tartı ölçümü ekle.'
          : `Şu an ~${kg(currentKg)}. Ulaşmak istediğin kiloyu yaz.${heightCm ? ` Boyuna göre sağlıklı alt sınır ${kg(minHealthyWeight(heightCm))}.` : ''}`}
      </Text>
      <Field label="Hedef kilo" suffix="kg" keyboardType="decimal-pad" value={text} onChangeText={(t) => { setText(t); setError(null); }} placeholder="80" />
      {error ? <Text style={{ color: c.danger, fontSize: 13 }}>{error}</Text> : null}
      <Button label="Hedefi kaydet" icon="flag-checkered" onPress={submit} disabled={currentKg == null} />
      {onCancel ? <Button kind="ghost" label="Vazgeç" onPress={onCancel} /> : null}
    </Card>
  );
}

function DailyLimitCard({ model, profile, onSaveProfile }: { model: Model; profile: Profile; onSaveProfile: (p: Profile) => Promise<void> }) {
  const c = useColors();
  const overlay = useOverlay();
  const limit = model.limit;
  const editProfile = () =>
    overlay.open(<ProfileEditor profile={profile} today={model.today} onSave={onSaveProfile} onDone={overlay.close} />, 'bottom');

  if (limit.kind === 'missing') {
    return (
      <Card>
        <Title>Günlük kalori sınırın</Title>
        <Text style={{ color: c.textMuted, fontSize: 14, lineHeight: 20 }}>
          Sınırını hesaplamak için eksik: {limit.missing.join(', ')}.
          {limit.missing.includes('kilo') ? ' Kiloyu aşağıdaki Tartı bölümünden ekle.' : ''}
        </Text>
        <Button label="Profilini tamamla" icon="account-edit-outline" onPress={editProfile} />
      </Card>
    );
  }

  const k10 = stepsImpact(10000, model.stride, model.currentKg)?.kcalPerDay ?? null;
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginRight: -10, marginTop: -6 }}>
        <Title>Günlük kalori sınırın</Title>
        <IconButton
          icon="information-outline"
          label="Sınır nasıl hesaplanır?"
          color={c.accent}
          onPress={() => overlay.open(<LimitInfo base={limit.base} kcal10k={k10} />, 'center')}
        />
      </View>
      <Text style={{ color: c.text, fontSize: 40, fontWeight: '800', letterSpacing: -1, fontVariant: ['tabular-nums'], marginTop: -8 }}>
        {fmtInt(limit.limit)}
        <Text style={{ fontSize: 18, color: c.textMuted }}> kcal</Text>
      </Text>
      <Text style={{ color: c.textMuted, fontSize: 14, lineHeight: 20 }}>
        Boy, kilo, yaş ve cinsiyetine göre vücudun günde ~{fmtInt(limit.base)} kcal yakar. Attığın her adım buna eklenir.
        Bu toplamdan az beslendiğinde kilo verirsin.
      </Text>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1, backgroundColor: c.surfaceAlt, borderRadius: radius.control, padding: 12 }}>
          <Text style={{ color: c.textMuted, fontSize: 12, fontWeight: '600' }}>Vücudun</Text>
          <Text style={{ color: c.text, fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{fmtInt(limit.base)}</Text>
        </View>
        <View style={{ flex: 1, backgroundColor: c.accentSoft, borderRadius: radius.control, padding: 12 }}>
          <Text style={{ color: c.accent, fontSize: 12, fontWeight: '600' }}>Bugünkü adımların</Text>
          <Text style={{ color: c.accent, fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] }}>+{fmtInt(limit.walking)}</Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 2 }}>
        <Icon name="scale-balance" size={20} color={c.textMuted} />
        <Text style={{ color: c.textMuted, fontSize: 13.5, lineHeight: 19, flex: 1 }}>
          7.700 kcal açık ≈ 1 kg. Günde 500 kcal açık, haftada ~0,45 kg eder.
        </Text>
      </View>

      <View style={{ height: 1, backgroundColor: c.separator }} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Profili düzenle"
        onPress={editProfile}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, opacity: pressed ? 0.6 : 1 })}
      >
        <Icon name="account-circle-outline" size={24} color={c.textMuted} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.textMuted, fontSize: 12, fontWeight: '600' }}>Hesaplamada kullanılan</Text>
          <Text style={{ color: c.text, fontSize: 14.5, fontWeight: '600' }}>{profileSummary(profile, model.currentKg, model.today)}</Text>
        </View>
        <Text style={{ color: c.accent, fontSize: 15, fontWeight: '700' }}>Düzenle</Text>
      </Pressable>
    </Card>
  );
}

function profileSummary(p: Profile, weightKg: number | null, today: string): string {
  const parts = [
    p.heightCm != null ? `${fmtInt(p.heightCm)} cm` : null,
    weightKg != null ? kg(weightKg) : null,
    p.birthYear != null ? `${Number(today.slice(0, 4)) - p.birthYear} yaş` : null,
    p.sex === 'female' ? 'Kadın' : p.sex === 'male' ? 'Erkek' : null,
    ACTIVITY_LEVELS.find((a) => a.factor === p.activityFactor)?.short ?? 'Oturarak',
  ];
  return parts.filter(Boolean).join(' · ');
}

/** Bilgi kutusu: sınırın mantığı, kullanıcının kendi sayılarıyla. */
function LimitInfo({ base, kcal10k }: { base: number; kcal10k: number | null }) {
  const c = useColors();
  const walk = kcal10k ?? 330;
  // Örnek yemek: yürümeden fazla, 10.000 adımla açık verecek bir değer (50'ye yuvarlanmış).
  const eaten = Math.round((base + walk / 2) / 50) * 50;
  const surplus = eaten - base;
  const deficit = base + walk - eaten;
  const P = ({ children }: { children: ReactNode }) => <Text style={{ color: c.text, fontSize: 15, lineHeight: 22 }}>{children}</Text>;
  const B = ({ children }: { children: ReactNode }) => <Text style={{ fontWeight: '800' }}>{children}</Text>;
  return (
    <>
      <Text style={{ color: c.text, fontSize: 20, fontWeight: '800', marginRight: 36 }}>Sınır nasıl hesaplanır?</Text>
      <P>Vücudun gün boyunca iki şekilde kalori yakar:</P>
      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Text style={{ color: c.accent, fontWeight: '800', fontSize: 15 }}>1.</Text>
          <P>
            <B>Kendi kendine:</B> nefes, kalp, beyin ve günlük ufak hareketler. Boy, kilo, yaş ve cinsiyetinden hesaplıyoruz.
            Senin için ≈ <B>{fmtInt(base)} kcal</B>.
          </P>
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Text style={{ color: c.accent, fontWeight: '800', fontSize: 15 }}>2.</Text>
          <P>
            <B>Yürürken:</B> adımlarınla yaktığın. Örneğin 10.000 adımda ≈ <B>{fmtInt(walk)} kcal</B>.
          </P>
        </View>
      </View>
      <P>
        Bugünkü toplam harcaman: {fmtInt(base)} + {fmtInt(walk)} = <B>{fmtInt(base + walk)} kcal</B>. Kilo vermek için yediğinin bu
        toplamdan az olması gerekir.
      </P>
      <View style={{ backgroundColor: c.surfaceAlt, borderRadius: radius.control, padding: 14, gap: 8 }}>
        <Text style={{ color: c.text, fontSize: 15, fontWeight: '700' }}>Örnek: Bugün {fmtInt(eaten)} kcal yedin.</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Icon name="close-circle" size={18} color={c.danger} />
          <Text style={{ color: c.text, fontSize: 14.5, lineHeight: 20, flex: 1 }}>
            Hiç yürümediysen: harcama {fmtInt(base)} → <Text style={{ color: c.danger, fontWeight: '800' }}>{fmtInt(surplus)} kcal fazla</Text>, kilo alırsın.
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Icon name="check-circle" size={18} color={c.accent} />
          <Text style={{ color: c.text, fontSize: 14.5, lineHeight: 20, flex: 1 }}>
            10.000 adım attıysan: harcama {fmtInt(base + walk)} → <Text style={{ color: c.accent, fontWeight: '800' }}>{fmtInt(deficit)} kcal açık</Text>, kilo verirsin.
          </Text>
        </View>
      </View>
      <P>
        <B>Açık ve kilo:</B> yaklaşık 7.700 kcal açık 1 kg yağa denk gelir. Günde 500 kcal açık, haftada ~0,45 kg; ayda ~2 kg eder.
      </P>
      <Text style={{ color: c.textFaint, fontSize: 12.5, lineHeight: 17 }}>
        Değerler tahmindir; gerçek hızını tartı ölçümlerin gösterir.
      </Text>
    </>
  );
}

function StepsImpactCard({ model }: { model: Model }) {
  const c = useColors();
  if (model.impact == null || model.avgSteps == null) {
    if (model.stride == null || model.currentKg == null) return null;
    return (
      <Card>
        <Title>Adımlarının katkısı</Title>
        <Text style={{ color: c.textMuted, fontSize: 14 }}>Birkaç günlük adım kaydı oluşunca burada görünecek.</Text>
      </Card>
    );
  }
  const grams = (kgValue: number) => `${fmtInt(kgValue * 1000)} g`;
  return (
    <Card>
      <Title>Adımlarının katkısı</Title>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Metric label={`Son ${model.avgDays} gün ort.`} value={fmtInt(model.avgSteps)} unit="adım" />
        <Metric label="Günde yakılan" value={fmtInt(model.impact.kcalPerDay)} unit="kcal" />
        <Metric label="Haftada" value={`−${grams(model.impact.kgPerWeek)}`} unit="yağ karşılığı" accent />
      </View>
      {model.extraImpact ? (
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: c.accentSoft, borderRadius: radius.control, padding: 12 }}>
          <Text style={{ color: c.accent, fontSize: 22, fontWeight: '800' }}>+{fmtInt(EXTRA_STEPS)}</Text>
          <Text style={{ color: c.text, fontSize: 14, flex: 1, lineHeight: 19 }}>
            adım/gün daha atarsan haftada yaklaşık <Text style={{ fontWeight: '800' }}>{grams(model.extraImpact.kgPerWeek)}</Text> daha verirsin.
          </Text>
        </View>
      ) : null}
    </Card>
  );
}

function ScaleCard({ model }: { model: Model }) {
  const c = useColors();
  if (model.rate.kind !== 'ok') return null;
  const r = model.rate.rate;
  const deficit = r.dailyBalanceKcal < 0;
  const fromSteps = model.impact && deficit ? Math.min(1, model.impact.kcalPerDay / -r.dailyBalanceKcal) : null;
  return (
    <Card>
      <Title>Tartıya göre</Title>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Metric label="Haftalık hız" value={`${r.kgPerWeek <= 0 ? '−' : '+'}${fmt1(Math.abs(r.kgPerWeek))}`} unit="kg/hafta" accent={deficit} />
        <Metric label={deficit ? 'Günlük açık' : 'Günlük fazla'} value={signedKcal(r.dailyBalanceKcal).replace(' kcal', '')} unit="kcal/gün" accent={deficit} />
      </View>
      <Text style={{ color: c.textMuted, fontSize: 14, lineHeight: 20 }}>
        {deficit
          ? `Son ${r.spanDays} günde tartın, günde ortalama ~${fmtInt(-r.dailyBalanceKcal)} kcal açık verdiğini gösteriyor.${
              fromSteps != null ? ` Bunun yaklaşık %${fmtInt(fromSteps * 100)}'i adımlarından geliyor.` : ''
            }`
          : `Son ${r.spanDays} günde kilon düşmüyor. Sınırının altında kalmak ve adımlarını artırmak dengeyi açığa çevirir.`}
      </Text>
      <Text style={{ color: c.textFaint, fontSize: 12.5, lineHeight: 17 }}>
        1 kg ≈ 7.700 kcal yaklaşımıyla hesaplanır. İlk haftalardaki hızlı düşüşün bir kısmı su kaybıdır.
      </Text>
    </Card>
  );
}

function Metric({ label, value, unit, accent }: { label: string; value: string; unit: string; accent?: boolean }) {
  const c = useColors();
  return (
    <View style={{ flex: 1, backgroundColor: c.surfaceAlt, borderRadius: radius.control, padding: 12, gap: 2 }}>
      <Text style={{ color: c.textMuted, fontSize: 12, fontWeight: '600' }}>{label}</Text>
      <Text style={{ color: accent ? c.accent : c.text, fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{value}</Text>
      <Text style={{ color: c.textFaint, fontSize: 11.5 }}>{unit}</Text>
    </View>
  );
}

function AddWeight({ today, onAdd }: { today: string; onAdd: (date: string, kg: number) => Promise<void> }) {
  const c = useColors();
  const [text, setText] = useState('');
  const [date, setDate] = useState(today);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setDate(today), [today]);
  const submit = async () => {
    const value = parseDecimal(text);
    if (value == null || value < 20 || value > 400) return setError('20–400 kg arasında bir değer gir.');
    if (!isValidKey(date) || date > today) return setError('Tarih YYYY-AA-GG biçiminde olmalı ve ileri bir gün olmamalı.');
    setError(null);
    await onAdd(date, Math.round(value * 10) / 10);
    setText('');
  };
  return (
    <Card>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Field label="Kilo" suffix="kg" keyboardType="decimal-pad" value={text} onChangeText={setText} placeholder="89,0" />
        <Field label="Tarih" value={date} onChangeText={setDate} placeholder="YYYY-AA-GG" autoCapitalize="none" />
      </View>
      {error ? <Text style={{ color: c.danger, fontSize: 13 }}>{error}</Text> : null}
      <Button label="Ölçüm ekle" icon="plus" onPress={submit} />
      <Text style={{ color: c.textFaint, fontSize: 12.5 }}>En doğru sonuç için sabah, tuvaletten sonra ve kahvaltıdan önce tartıl.</Text>
    </Card>
  );
}

const PAIRS = [1, 2, 3, 4, 5, 6, 7].map((first) => ({
  first,
  label: `${WEEKDAY_SHORT[first - 1]} · ${WEEKDAY_SHORT[(first + 2) % 7]}`,
}));

function ReminderSettings() {
  const c = useColors();
  const [reminder, setReminder] = useState<WeighReminder>(() => StepTracker.getWeighReminder());
  const update = (next: WeighReminder) => {
    StepTracker.setWeighReminder(next.enabled, next.firstDay, next.hour);
    setReminder(next);
  };
  const toggle = async (enabled: boolean) => {
    if (enabled) {
      const permission = await requestNotifications();
      if (permission !== 'granted') {
        Alert.alert('Bildirim izni gerekli', 'Hatırlatma göndermek için bildirim iznine ihtiyaç var.', [
          { text: 'Vazgeç', style: 'cancel' },
          { text: 'Ayarları aç', onPress: () => StepTracker.openNotificationSettings() },
        ]);
        return;
      }
    }
    update({ ...reminder, enabled });
  };
  return (
    <>
      <Group>
        <SwitchRow
          icon="scale-bathroom"
          title="Tartılma hatırlatıcısı"
          subtitle={reminder.enabled ? `${PAIRS[reminder.firstDay - 1].label} · ${String(reminder.hour).padStart(2, '0')}:00` : 'Haftada 2 gün, sabah'}
          value={reminder.enabled}
          onChange={toggle}
        />
      </Group>
      {reminder.enabled ? (
        <Card>
          <Text style={{ color: c.textMuted, fontSize: 13, fontWeight: '600' }}>Günler (3 gün arayla)</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {PAIRS.map((p) => {
              const selected = p.first === reminder.firstDay;
              return (
                <Pressable
                  key={p.first}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => update({ ...reminder, firstDay: p.first })}
                  style={{
                    paddingHorizontal: 14,
                    minHeight: 40,
                    justifyContent: 'center',
                    borderRadius: radius.pill,
                    backgroundColor: selected ? c.accentSoft : c.surfaceAlt,
                    borderWidth: selected ? 1.5 : 0,
                    borderColor: c.accent,
                  }}
                >
                  <Text style={{ color: selected ? c.accent : c.text, fontWeight: selected ? '800' : '600' }}>{p.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={{ color: c.textMuted, fontSize: 13, fontWeight: '600' }}>Saat</Text>
          <Segmented<number>
            options={[6, 7, 8, 9].map((h) => ({ value: h, label: `0${h}:00` }))}
            value={reminder.hour}
            onChange={(h) => h != null && update({ ...reminder, hour: h })}
          />
        </Card>
      ) : null}
    </>
  );
}

/** Aşağıdan açılan profil penceresi: üstte kalori sınırını belirleyen bilgiler, altta adımlarla ilgili olanlar. */
function ProfileEditor({
  profile,
  today,
  onSave,
  onDone,
}: {
  profile: Profile;
  today: string;
  onSave: (p: Profile) => Promise<void>;
  onDone: () => void;
}) {
  const c = useColors();
  const [form, setForm] = useState({ height: '', birthYear: '', stride: '', goal: '', calMeters: '', calSteps: '' });
  const [sex, setSex] = useState<Sex | null>(null);
  const [activity, setActivity] = useState<number | null>(null);
  const [showCalibration, setShowCalibration] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    setForm((f) => ({
      ...f,
      height: str(profile.heightCm),
      birthYear: str(profile.birthYear),
      stride: str(profile.strideCm),
      goal: String(profile.dailyGoal),
    }));
    setSex(profile.sex);
    setActivity(profile.activityFactor);
  }, [profile]);

  const set = (k: keyof typeof form) => (t: string) => {
    setForm((f) => ({ ...f, [k]: t }));
    setMsg(null);
  };

  const submit = async () => {
    const heightCm = parseDecimal(form.height);
    const birthYear = parseDecimal(form.birthYear);
    const stride = parseDecimal(form.stride);
    const goal = parseDecimal(form.goal);
    const year = Number(today.slice(0, 4));
    const errors: string[] = [];
    if (heightCm != null && (heightCm < 100 || heightCm > 250)) errors.push('Boy 100–250 cm olmalı.');
    if (birthYear != null && (birthYear < year - 110 || birthYear > year - 18)) errors.push('Bu bölüm 18 yaş ve üzeri içindir.');
    if (stride != null && (stride < 30 || stride > 150)) errors.push('Adım uzunluğu 30–150 cm olmalı.');
    if (goal == null || goal < 100 || goal > 100000) errors.push('Adım hedefi 100–100.000 olmalı.');
    if (errors.length) return setMsg({ ok: false, text: errors.join(' ') });
    await onSave({
      ...profile,
      heightCm,
      birthYear: birthYear == null ? null : Math.round(birthYear),
      sex,
      activityFactor: activity,
      strideCm: stride,
      dailyGoal: Math.round(goal!),
    });
    onDone();
  };
  const Label = ({ children }: { children: ReactNode }) => (
    <Text style={{ color: c.textMuted, fontSize: 13, fontWeight: '600' }}>{children}</Text>
  );

  const calibrated = strideFromCalibration(parseDecimal(form.calMeters) ?? 0, parseDecimal(form.calSteps) ?? 0);

  return (
    <>
      <Text style={{ color: c.text, fontSize: 20, fontWeight: '800', marginRight: 36 }}>Profilin</Text>

      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 4 }}>
        <Icon name="fire" size={18} color={c.accent} />
        <Text style={{ color: c.text, fontSize: 15, fontWeight: '800' }}>Kalori sınırın için</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Field label="Boy" suffix="cm" keyboardType="decimal-pad" value={form.height} onChangeText={set('height')} />
        <Field label="Doğum yılı" keyboardType="number-pad" value={form.birthYear} onChangeText={set('birthYear')} />
      </View>
      <Text style={{ color: c.textFaint, fontSize: 12.5 }}>Kilon, son tartı ölçümünden otomatik alınır.</Text>

      <Label>Cinsiyet</Label>
      <Segmented<Sex>
        options={[
          { value: 'female', label: 'Kadın' },
          { value: 'male', label: 'Erkek' },
        ]}
        value={sex}
        onChange={(v) => {
          setSex(v);
          setMsg(null);
        }}
      />

      <Label>Yürüyüş dışında günün nasıl geçiyor?</Label>
      <Segmented<number>
        options={ACTIVITY_LEVELS.map((a) => ({ value: a.factor, label: a.short }))}
        value={activity}
        onChange={(v) => {
          setActivity(v);
          setMsg(null);
        }}
      />
      <Text style={{ color: c.textFaint, fontSize: 12.5 }}>
        {activity != null ? ACTIVITY_LEVELS.find((a) => a.factor === activity)?.hint : 'Seçilmezse "Oturarak" kabul edilir. Yürüyüş adımlarından ayrıca eklenir.'}
      </Text>

      <View style={{ height: 1, backgroundColor: c.separator, marginVertical: 4 }} />
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <Icon name="shoe-print" size={18} color={c.accent} />
        <Text style={{ color: c.text, fontSize: 15, fontWeight: '800' }}>Adımların için</Text>
      </View>
      <Field label="Günlük adım hedefi" suffix="adım" keyboardType="number-pad" value={form.goal} onChangeText={set('goal')} />

      <Field
        label="Adım uzunluğu"
        suffix="cm"
        keyboardType="decimal-pad"
        value={form.stride}
        onChangeText={set('stride')}
        placeholder={profile.heightCm ? `boydan: ${fmt1(profile.heightCm * 0.414)}` : 'boydan hesaplanır'}
      />
      {showCalibration ? (
        <>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Field label="Yürünen mesafe" suffix="m" keyboardType="decimal-pad" value={form.calMeters} onChangeText={set('calMeters')} placeholder="100" />
            <Field label="Sayılan adım" keyboardType="number-pad" value={form.calSteps} onChangeText={set('calSteps')} />
          </View>
          {calibrated != null ? (
            <Button kind="tonal" label={`${fmt1(calibrated)} cm kullan`} onPress={() => setForm((f) => ({ ...f, stride: fmt1(calibrated) }))} />
          ) : null}
        </>
      ) : (
        <Button kind="ghost" compact icon="ruler" label="Bilinen bir mesafeyle kalibre et" onPress={() => setShowCalibration(true)} />
      )}

      {msg ? <Text style={{ color: msg.ok ? c.accent : c.danger, fontSize: 14 }}>{msg.text}</Text> : null}
      <Button label="Kaydet" icon="check" onPress={submit} />
    </>
  );
}
