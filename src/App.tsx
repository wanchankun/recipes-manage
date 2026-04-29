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

  // 献立にレシピを追加する
  const addRecipeToPlan = async (dateStr: string, recipeId: string) => {
    const { error } = await supabase
      .from('weekly_plans')
      .insert({ date: dateStr, recipe_id: recipeId }); // upsertではなくinsert

    if (!error) {
      fetchPlans();
    } else {
      alert("その料理は既に追加されています");
    }
  };

  // 献立から特定のレシピを外す
  const removeRecipeFromPlan = async (dateStr: string, recipeId: string) => {
    const { error } = await supabase
      .from('weekly_plans')
      .delete()
      .eq('date', dateStr)
      .eq('recipe_id', recipeId);

    if (!error) {
      // 関連する材料チェックも削除
      await supabase.from('ingredient_checks')
        .delete()
        .eq('date', dateStr)
        .eq('recipe_id', recipeId);
      
      fetchPlans();
      fetchChecks();
    }
  };

  // --- 削除ボタンを押した時 ---
  const handleDelete = async (id: string) => {
    if (confirm('このレシピを消してもいいですか？')) {
      // 献立表からもこのレシピを削除しておく
      await supabase.from('weekly_plans').delete().eq('recipe_id', id);
    
      // 1. 【追加】そのレシピに関連する材料のチェック状態を削除
      await supabase
        .from('ingredient_checks')
        .delete()
        .eq('recipe_id', id);

      // 2. 【既存】レシピ本体を削除
      await supabase.from('recipes').delete().eq('id', id);
      
      // 3. 画面を更新
      fetchRecipes();
      fetchPlans();
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
                // ★その日のプランをすべて抽出
                const dailyPlans = plans.filter(p => p.date === dateStr);
                const dayLabels = ['日', '月', '火', '水', '木', '金', '土'];
                const dayName = dayLabels[new Date(dateStr).getDay()];

                return (
                  <Paper key={dateStr} withBorder p="md" mb="xs" radius="md">
                    <Group justify="space-between" mb="xs">
                      <Text fw={700}>{dateStr.slice(5)} ({dayName})</Text>
                      
                      {/* レシピ追加用のSelect（選んだら addRecipeToPlan を実行） */}
                      <Select
                        placeholder="料理を追加"
                        data={recipes
                          .slice()
                          .sort((a, b) => a.name.localeCompare(b.name, 'ja'))
                          .map(r => ({ value: r.id, label: r.name }))
                        }
                        value={null} // 常に空にしておく
                        onChange={(value) => value && addRecipeToPlan(dateStr, value)}
                        searchable
                        style={{ width: 150 }}
                        size="xs"
                      />
                    </Group>

                    {/* ★登録された料理を並べて表示 */}
                    <Stack gap="xs">
                      {dailyPlans.map((plan) => {
                        const selectedRecipe = recipes.find(r => r.id === plan.recipe_id);
                        if (!selectedRecipe) return null;

                        return (
                          <Box key={plan.recipe_id} p="xs" style={{ border: '1px solid #eee', borderRadius: '8px', backgroundColor: '#fff' }}>
                            <Group justify="space-between" mb="xs">
                              <Text fw={600} size="sm">{selectedRecipe.name}</Text>
                              <ActionIcon color="red" variant="subtle" size="sm" onClick={() => removeRecipeFromPlan(dateStr, selectedRecipe.id)}>
                                <IconTrash size={14} />
                              </ActionIcon>
                            </Group>

                            {/* 材料ボタンを表示 */}
                            <Group gap="sm" justify="flex-start" style={{ flexWrap: 'wrap' }}>
                              {selectedRecipe.ingredients.map((ing, idx) => {
                                const ingredientKey = `${dateStr}-${selectedRecipe.id}-${ing.name}`;
                                const isChecked = checkedIngredients.includes(ingredientKey);

                                return (
                                  <Box
                                    key={idx}
                                    onClick={() => toggleIngredient(dateStr, selectedRecipe.id, ing.name)}
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      padding: '8px 12px',
                                      fontSize: '13px',
                                      borderRadius: '20px',
                                      cursor: 'pointer',
                                      userSelect: 'none',
                                      border: '1px solid',
                                      borderColor: isChecked ? '#e0e0e0' : '#339af0',
                                      backgroundColor: isChecked ? '#f8f9fa' : '#ebf7ff',
                                      color: isChecked ? '#adb5bd' : '#1c7ed6',
                                      textDecoration: isChecked ? 'line-through' : 'none',
                                      minWidth: '70px',
                                      justifyContent: 'center'
                                    }}
                                  >
                                    {ing.name}
                                  </Box>
                                );
                              })}
                            </Group>
                          </Box>
                        );
                      })}
                    </Stack>
                  </Paper>
                );
              })}
            </Stack>

            {/* --- 合計金額の表示エリア --- */}
            <Group justify="space-between">
              <Stack gap={0}>
                <Text size="xs" c="dimmed" fw={700}>合計</Text>
                <Text size="xl" fw={900} c="blue">
                  {/* 合計金額の計算部分 */}
                  {weekDays.reduce((weeklyTotal, dateStr) => {
                    // その日のプランをすべて取得
                    const dailyPlans = plans.filter(p => p.date === dateStr);
                    
                    // その日の全レシピの材料費を合計
                    const dayTotal = dailyPlans.reduce((sum, plan) => {
                      const recipe = recipes.find(r => r.id === plan.recipe_id);
                      return sum + (recipe?.ingredients.reduce((s, i) => s + i.price, 0) || 0);
                    }, 0);

                    return weeklyTotal + dayTotal;
                  }, 0).toLocaleString()}
                  <Text span size="sm" ml={4}>円</Text>
                </Text>
              </Stack>

              {/* 1日あたりの平均を表示するエリア */}
              <Stack gap={0} align="flex-end">
                <Text size="xs" c="dimmed">平均</Text>
                <Text fw={700}>
                  {/* --- 1日平均の計算部分 --- */}
                  {(() => {
                    // 1. 合計金額（ここも「存在するレシピ」だけで計算するように念のため修正）
                    const totalAmount = weekDays.reduce((weeklyTotal, dateStr) => {
                      const dailyPlans = plans.filter(p => p.date === dateStr);
                      const dayTotal = dailyPlans.reduce((sum, plan) => {
                        const recipe = recipes.find(r => r.id === plan.recipe_id);
                        // レシピが存在する場合のみ金額を加算
                        return sum + (recipe ? recipe.ingredients.reduce((s, i) => s + i.price, 0) : 0);
                      }, 0);
                      return weeklyTotal + dayTotal;
                    }, 0);

                    // 2. 「有効なレシピが1つ以上登録されている日」だけを数える
                    const plannedDaysCount = weekDays.filter(dateStr => {
                      const dailyPlans = plans.filter(p => p.date === dateStr);
                      // その日のプランの中に、現在のレシピ一覧に存在するIDが1つでもあるかチェック
                      return dailyPlans.some(p => recipes.some(r => r.id === p.recipe_id));
                    }).length;

                    // 3. 計算
                    const average = plannedDaysCount > 0 ? Math.round(totalAmount / plannedDaysCount) : 0;

                    return average.toLocaleString();
                  })()} 円
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