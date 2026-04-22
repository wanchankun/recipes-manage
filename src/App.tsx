import { useEffect, useState } from 'react';
import { TextInput, NumberInput, Button, Stack, Container, Title, Group, ActionIcon, Paper, List, Text, Divider, Box } from '@mantine/core';
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
      setRecipes(data as Recipe[]);
    }
  };

    // 今週の月曜日の日付を取得する関数
  const getMonday = (d: Date) => {
    const day = d.getDay();
    // 日曜(0)なら6日戻し、それ以外なら (day - 1)日戻す
    const diff = d.getDate() - (day === 0 ? 6 : day - 1); 
    const monday = new Date(d.setDate(diff));
    // 日本時間のまま日付文字列にするための工夫
    const y = monday.getFullYear();
    const m = String(monday.getMonth() + 1).padStart(2, '0');
    const date = String(monday.getDate()).padStart(2, '0');
    return `${y}-${m}-${date}`;
  };

  // 基準となる日（今週の月曜）
  const [baseDate, setBaseDate] = useState(getMonday(new Date()));

  // 表示用の7日間を作成する
  const weekDays = [...Array(7)].map((_, i) => {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + i);
    return d.toISOString().split('T')[0];
  });

  const [plans, setPlans] = useState<{date: string, recipe_id: string | null}[]>([]);

  // 献立データを取得する
  const fetchPlans = async () => {
    const { data } = await supabase.from('weekly_plans').select('*').order('id');
    if (data) setPlans(data);
  };

  // チェック状態を保存する箱
  const [checkedIngredients, setCheckedIngredients] = useState<string[]>([]);

  // チェック状態を取得する
  const fetchChecks = async () => {
    const { data } = await supabase.from('ingredient_checks').select('*');
    if (data) {
      // 画面で扱いやすいように「日付-レシピID-材料名」の形式の文字列リストにする
      const checkIds = data.map(c => `${c.date}-${c.recipe_id}-${c.ingredient_name}`);
      setCheckedIngredients(checkIds);
    }
  };

  // チェックを切り替える（DBに保存）
  const toggleIngredient = async (dateStr: string, recipeId: string, ingredientName: string) => {
    const key = `${dateStr}-${recipeId}-${ingredientName}`;
    const isCurrentlyChecked = checkedIngredients.includes(key);

    if (isCurrentlyChecked) {
      // チェックを外す（DBから削除）
      await supabase.from('ingredient_checks')
        .delete()
        .eq('date', dateStr)
        .eq('recipe_id', recipeId)
        .eq('ingredient_name', ingredientName);
    } else {
      // チェックを入れる（DBに保存）
      await supabase.from('ingredient_checks')
        .insert({ date: dateStr, recipe_id: recipeId, ingredient_name: ingredientName });
    }
    
    fetchChecks(); // 画面を更新
  };

  useEffect(() => {
    const loadData = async () => {
     // await を使って順番に処理することで、連鎖的な更新を防ぎます
      await fetchRecipes();
      await fetchPlans();
      await fetchChecks(); // これを追加
    };
    loadData();
  }, []);

  // 献立を更新する（選んだ瞬間にDBに保存する）
  const updatePlan = async (dateStr: string, recipeId: string | null) => {
    const { error } = await supabase
      .from('weekly_plans')
      .upsert({ date: dateStr, recipe_id: recipeId }, { onConflict: 'date' }); // upsertを使うのがプロの技！

    if (error) {
      console.error('保存エラー:', error);
    }
    fetchPlans(); 
  };

  // --- 削除ボタンを押した時 ---
  const handleDelete = async (id: string) => {
    if (confirm('このレシピを消してもいいですか？')) {
      // 1. 【追加】そのレシピに関連する材料のチェック状態を削除
      await supabase
        .from('ingredient_checks')
        .delete()
        .eq('recipe_id', id);

      // 2. 【既存】レシピ本体を削除
      await supabase.from('recipes').delete().eq('id', id);
      
      // 3. 画面を更新
      fetchRecipes();
      fetchChecks(); // チェック状態の表示も最新にする
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

                // ★ 選ばれているレシピの情報を探しておく
                const selectedRecipe = recipes.find(r => r.id === plan?.recipe_id);

                {/* 献立エリアの材料表示部分 */}
                return (
                  <Paper key={dateStr} withBorder p="xs" mb="xs" radius="md">
                    <Group grow mb={selectedRecipe ? "xs" : 0}>
                      <Text fw={700} w={80}>{dateStr.slice(5)} ({dayName})</Text>
                      <Select
                        placeholder="料理を選択"
                        data={recipes.map(r => ({ value: r.id, label: r.name }))}
                        value={plan?.recipe_id || null}
                        onChange={(value) => updatePlan(dateStr, value)}
                        clearable
                      />
                    </Group>

                    <Group gap="sm" mt="xs" pl={0} justify="flex-start" style={{ flexWrap: 'wrap' }}>
                      {/* ★ ここから：レシピが選ばれている時だけ材料を表示する */}
                      {selectedRecipe?.ingredients.map((ing, idx) => {
                        const ingredientKey = `${dateStr}-${selectedRecipe.id}-${ing.name}`;
                        const isChecked = checkedIngredients.includes(ingredientKey);

                        return (
                          <Box
                            key={idx}
                            onClick={() => toggleIngredient(dateStr, selectedRecipe.id, ing.name)}
                            style={{
                              // --- スマホで押しやすくするための設定 ---
                              display: 'inline-flex',
                              alignItems: 'center',
                              padding: '10px 16px', // 上下左右にたっぷり余白をとる（重要！）
                              fontSize: '14px',     // 文字を少し大きく
                              borderRadius: '20px', // 丸みをもたせてボタン感を出す
                              cursor: 'pointer',
                              userSelect: 'none',
                              transition: 'all 0.2s',
                              border: '1px solid',
                              // --- 状態による見た目の変化 ---
                              borderColor: isChecked ? '#e0e0e0' : '#339af0',
                              backgroundColor: isChecked ? '#f8f9fa' : '#ebf7ff',
                              color: isChecked ? '#adb5bd' : '#1c7ed6',
                              textDecoration: isChecked ? 'line-through' : 'none',
                              // 押しやすくするために最小の幅を持たせる
                              minWidth: '80px',
                              justifyContent: 'center'
                            }}
                          >
                            {ing.name}
                          </Box>
                        );
                      })}
                    </Group>
                  </Paper>
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