import { useEffect, useState } from 'react';
import { TextInput, NumberInput, Button, Stack, Container, Title, Group, ActionIcon, Paper, List, Text, Divider } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconTrash, IconPlus, IconToolsKitchen2 } from '@tabler/icons-react';
import { supabase } from './supabaseClient';
import { Select } from '@mantine/core'; // Selectをインポートに追加
import { Tabs } from '@mantine/core';

// 型の定義（どんなデータか名前をつける）
interface Ingredient {
  name: string;
  price: number;
}

interface Recipe {
  id: string;
  name: string;
  ingredients: Ingredient[];
}

export default function App() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);

  // 今「編集」している最中かどうかを覚えておくための箱
  const [editingId, setEditingId] = useState<string | null>(null);  

  const form = useForm({
    initialValues: {
      recipeName: '',
      ingredients: [{ name: '', price: 0 }],
    },
  });

  // データを取得する関数
  const fetchRecipes = async () => {
    const { data, error } = await supabase
      .from('recipes')
      .select(`
        id,
        name,
        ingredients (
          name,
          price
        )
      `);
    
    if (!error && data) {
      setRecipes(data as any);
    }
  };

  // 今週の月曜日の日付を取得する関数
  const getMonday = (d: Date) => {
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // 月曜日を計算
    const monday = new Date(d.setDate(diff));
    return monday.toISOString().split('T')[0]; // '2026-04-20' 形式に変換
  };

  // 基準となる日（今週の月曜）
  const [baseDate, setBaseDate] = useState(getMonday(new Date()));

  // 表示用の7日間を作成する
  const weekDays = [...Array(7)].map((_, i) => {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + i);
    return d.toISOString().split('T')[0];
  });

  const [plans, setPlans] = useState<{date: string, recipe_id: string}[]>([]);

  // 献立データを取得する
  const fetchPlans = async () => {
    const { data } = await supabase.from('weekly_plans').select('*').order('id');
    if (data) setPlans(data);
  };

  // 画面を開いた時にレシピと一緒に取得
  useEffect(() => {
    fetchRecipes();
    fetchPlans();
  }, []);

  // 献立を更新する（選んだ瞬間にDBに保存する）
  const updatePlan = async (day: string, recipeId: string | null) => {
    await supabase
      .from('weekly_plans')
      .update({ recipe_id: recipeId })
      .eq('day_of_week', day);
    fetchPlans(); // 合計金額などを再計算するために再取得
  };

  // --- 削除ボタンを押した時 ---
  const handleDelete = async (id: string) => {
    if (confirm('このレシピを消してもいいですか？')) {
      await supabase.from('recipes').delete().eq('id', id);
      fetchRecipes(); // 画面を更新
    }
  };

  // --- 編集ボタンを押した時 ---
  const handleEdit = (recipe: Recipe) => {
    setEditingId(recipe.id); // 「このIDを編集中です」と記録
    // フォームの内容を、選んだレシピの内容に書き換える
    form.setValues({
      recipeName: recipe.name,
      ingredients: recipe.ingredients.map(ing => ({ name: ing.name, price: ing.price }))
    });
    // 画面の上（フォーム）に戻る
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // 画面が開いた時に実行
  useEffect(() => {
    fetchRecipes();
  }, []);

  const handleSave = async (values: typeof form.values) => {
    if (editingId) {
      // 【上書き保存】
      // 1. 料理名を更新
      await supabase.from('recipes').update({ name: values.recipeName }).eq('id', editingId);
      // 2. 材料を一度全部消して、新しい内容を入れ直す（これが一番簡単！）
      await supabase.from('ingredients').delete().eq('recipe_id', editingId);
      const ingredientsToSave = values.ingredients.map((ing) => ({
        recipe_id: editingId,
        name: ing.name,
        price: ing.price,
      }));
      await supabase.from('ingredients').insert(ingredientsToSave);
      
      setEditingId(null); // 編集モード終了
    } else {
      // 【新規登録】（今までのコードと同じ）
      const { data: recipeData } = await supabase
        .from('recipes').insert([{ name: values.recipeName }]).select().single();
      
      if (recipeData) {
        const ingredientsToSave = values.ingredients.map((ing) => ({
          recipe_id: recipeData.id,
          name: ing.name,
          price: ing.price,
        }));
        await supabase.from('ingredients').insert(ingredientsToSave);
      }
    }

    form.reset();
    fetchRecipes();
  };

  return (
    <Tabs defaultValue="plan">
      <Tabs.List>
        <Tabs.Tab value="plan">今週の献立</Tabs.Tab>
        <Tabs.Tab value="recipes">レシピ管理</Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel value="plan">
        {/* --- 今週の献立エリア --- */}
        <Container size="sm" py="xl">
          <Paper withBorder p="xl" radius="md" bg="blue.0">
            <Group justify="space-between" mb="md">
              <Button variant="subtle" onClick={() => {
                const d = new Date(baseDate);
                d.setDate(d.getDate() - 7);
                setBaseDate(d.toISOString().split('T')[0]);
              }}>← 前の週</Button>
              
              <Title order={3} c="blue.9">
                {baseDate} の週
              </Title>
              
              <Button variant="subtle" onClick={() => {
                const d = new Date(baseDate);
                d.setDate(d.getDate() + 7);
                setBaseDate(d.toISOString().split('T')[0]);
              }}>次の週 →</Button>
            </Group>

            <Stack gap="xs">
              {weekDays.map((dateStr) => {
                const plan = plans.find(p => p.date === dateStr);
                const dayLabels = ['日', '月', '火', '水', '木', '金', '土'];
                const dayName = dayLabels[new Date(dateStr).getDay()];

                return (
                  <Group key={dateStr} grow>
                    <Text fw={700} w={80}>{dateStr.slice(5)} ({dayName})</Text>
                    <Select
                      placeholder="料理を選択"
                      data={recipes.map(r => ({ value: r.id, label: r.name }))}
                      value={plan?.recipe_id || null}
                      onChange={(value) => updatePlan(dateStr, value)}
                      clearable
                    />
                  </Group>
                );
              })}
            </Stack>

            {/* --- 合計金額の表示エリア --- */}
            <Group justify="space-between">
              <Stack gap={0}>
                <Text size="xs" c="dimmed" fw={700}>合計</Text>
                <Text size="xl" fw={900} c="blue">
                  {/* 1週間分の合計計算 */}
                  {weekDays.reduce((weeklyTotal, dateStr) => {
                    // 1. その日の献立（plan）を探す
                    const plan = plans.find(p => p.date === dateStr);
                    if (!plan || !plan.recipe_id) return weeklyTotal;

                    // 2. その献立のレシピ情報を探す
                    const recipe = recipes.find(r => r.id === plan.recipe_id);
                    if (!recipe) return weeklyTotal;

                    // 3. そのレシピの材料費を合計する
                    const recipeTotal = recipe.ingredients.reduce((sum, ing) => sum + ing.price, 0);
                    
                    return weeklyTotal + recipeTotal;
                  }, 0).toLocaleString()} {/* 3桁カンマ区切りにする */}
                  <Text span size="sm" ml={4}>円</Text>
                </Text>
              </Stack>

              {/* おまけ：1日あたりの平均も出せます */}
              <Stack gap={0} align="flex-end">
                <Text size="xs" c="dimmed">1日平均</Text>
                <Text fw={700}>
                  {Math.round(weekDays.reduce((weeklyTotal, dateStr) => {
                    const plan = plans.find(p => p.date === dateStr);
                    const recipe = recipes.find(r => r.id === (plan?.recipe_id));
                    return weeklyTotal + (recipe?.ingredients.reduce((s, i) => s + i.price, 0) || 0);
                  }, 0) / 7).toLocaleString()} 円
                </Text>
              </Stack>
            </Group>
          </Paper>
        </Container>
      </Tabs.Panel>

      <Tabs.Panel value="recipes">
        <Container size="sm" py="xl">
          <Stack gap="xl">
            {/* --- 登録フォーム --- */}
            <Paper withBorder p="xl" radius="md" shadow="sm">
              <Title order={2} mb="lg">レシピを登録する</Title>
              <form onSubmit={form.onSubmit(handleSave)}>
                <Stack>
                  <TextInput label="料理名" placeholder="カレー" required {...form.getInputProps('recipeName')} />
                  {form.values.ingredients.map((_, index) => (
                    <Group key={index} align="flex-end">
                      <TextInput label="材料" style={{ flex: 1 }} {...form.getInputProps(`ingredients.${index}.name`)} />
                      <NumberInput label="価格" style={{ width: 100 }} {...form.getInputProps(`ingredients.${index}.price`)} />
                      <ActionIcon color="red" variant="light" onClick={() => form.removeListItem('ingredients', index)}>
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Group>
                  ))}
                  <Button variant="outline" leftSection={<IconPlus size={16} />} onClick={() => form.insertListItem('ingredients', { name: '', price: 0 })}>
                    材料を追加
                  </Button>
                  <Button type="submit" fullWidth mt="md">保存</Button>
                </Stack>
              </form>
            </Paper>


            <Divider label="登録済みレシピ" labelPosition="center" />

            {/* --- 一覧表示エリア --- */}
            <Stack>
              {recipes.length === 0 ? (
                <Text c="dimmed" ta="center">レシピがまだありません</Text>
              ) : (
                recipes.map((recipe) => (
                  <Paper key={recipe.id} withBorder p="md" radius="md">
                    <Group justify="space-between" mb="xs">
                      <Group>
                        <IconToolsKitchen2 size={20} color="orange" />
                        <Text fw={700} size="lg">{recipe.name}</Text>
                      </Group>
                      <Group>
                        {/* 編集ボタン */}
                        <Button variant="light" size="xs" onClick={() => handleEdit(recipe)}>変更</Button>
                        {/* 削除ボタン */}
                        <Button variant="light" color="red" size="xs" onClick={() => handleDelete(recipe.id)}>削除</Button>
                      </Group>                  <Text size="sm" fw={700} c="blue">
                        合計: {recipe.ingredients.reduce((sum, i) => sum + i.price, 0)}円
                      </Text>
                    </Group>
                    <List size="sm" c="dimmed" withPadding>
                      {recipe.ingredients.map((ing, idx) => (
                        <List.Item key={idx}>{ing.name} ({ing.price}円)</List.Item>
                      ))}
                    </List>
                  </Paper>
                ))
              )}
            </Stack>
          </Stack>
        </Container>
       </Tabs.Panel>
    </Tabs>
  );
}